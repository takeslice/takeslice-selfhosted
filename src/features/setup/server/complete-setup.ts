import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db/client";
import { account, auditLog, instance, user } from "@/lib/db/schema";
import { programSettings, emailSettings } from "@/lib/db/schema/instance";
import { encryptSecret } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { parseMoneyToMinor } from "@/lib/money";
import { SETUP_COOKIE, ensureInstance, tokenMatches } from "./setup-token";
import type { SetupInput } from "../schemas";

export type SetupResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function completeSetup(input: SetupInput): Promise<SetupResult> {
  const current = await ensureInstance();
  if (current.setupCompletedAt) return { ok: false, error: "This instance is already set up." };

  const token = (await cookies()).get(SETUP_COOKIE)?.value ?? "";
  if (!tokenMatches(token, current.setupTokenHash)) {
    return { ok: false, error: "Your setup session expired. Reload the page and enter the setup token again." };
  }

  const minimumPayoutMinor = parseMoneyToMinor(input.minimumPayout, input.currency);
  if (minimumPayoutMinor === null) return { ok: false, error: "Check the amounts below.", fieldErrors: { minimumPayout: "Enter an amount like 50 or 50.00." } };
  const fixedMinor = input.rateType === "fixed" ? parseMoneyToMinor(input.commissionFixed ?? "", input.currency) : null;
  if (input.rateType === "fixed" && (!fixedMinor || fixedMinor <= 0)) {
    return { ok: false, error: "Check the commission amount.", fieldErrors: { commissionFixed: "Enter an amount like 10 or 10.00." } };
  }

  const normalizedEmail = input.adminEmail.trim().toLowerCase();
  const passwordHash = await hashPassword(input.adminPassword);
  const userId = newId("usr");

  try {
    await db.transaction(async (tx) => {
      // Lock the singleton: two concurrent submissions must not create two admins.
      const [locked] = await tx.select().from(instance).where(eq(instance.id, "default")).for("update");
      if (!locked || locked.setupCompletedAt) throw new SetupConflictError();

      await tx.insert(user).values({ id: userId, name: input.adminName, email: normalizedEmail, emailVerified: true, role: "admin" });
      await tx.insert(account).values({ id: newId("acc"), accountId: userId, providerId: "credential", userId, password: passwordHash });
      await tx.insert(programSettings).values({
        id: "default",
        businessName: input.businessName,
        websiteUrl: input.websiteUrl,
        programName: input.programName,
        programSlug: input.programSlug,
        description: input.description,
        supportEmail: input.supportEmail || null,
        currency: input.currency,
        rateType: input.rateType,
        commissionBps: Math.round(input.commissionPercent * 100),
        commissionFixedMinor: input.rateType === "fixed" ? fixedMinor : null,
        attributionDays: input.attributionDays,
        validationDays: input.validationDays,
        holdingDays: input.holdingDays,
        approvalMode: input.approvalMode,
        minimumPayoutMinor,
      });
      await tx.insert(emailSettings).values({
        id: "default",
        host: input.smtpHost || null,
        port: input.smtpPort,
        secure: input.smtpSecure === "true",
        username: input.smtpUser || null,
        passwordEncrypted: input.smtpPassword ? encryptSecret(input.smtpPassword) : null,
        fromName: input.smtpFromName,
        fromEmail: input.smtpFromEmail || input.supportEmail || normalizedEmail,
      });
      await tx.update(instance).set({ setupCompletedAt: new Date(), setupTokenHash: null }).where(eq(instance.id, "default"));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId: userId,
        action: "instance.setup_completed",
        targetType: "instance",
        targetId: "default",
        metadata: { email: normalizedEmail },
      });
    });
  } catch (error) {
    if (error instanceof SetupConflictError) return { ok: false, error: "This instance is already set up." };
    if (isUniqueViolation(error)) return { ok: false, error: "Check the details below.", fieldErrors: { adminEmail: "An account with this email already exists." } };
    console.error("[setup] completion failed", error);
    return { ok: false, error: "Setup could not be completed. Check the server logs and try again." };
  }

  (await cookies()).delete(SETUP_COOKIE);
  return { ok: true };
}

class SetupConflictError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
  return code === "23505";
}
