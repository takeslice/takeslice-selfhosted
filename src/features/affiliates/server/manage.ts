import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db/client";
import { account, affiliate, auditLog, user } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { getProgramSettings } from "@/features/program/server/settings";
import { createDefaultReferralLink } from "@/features/links/server/links";
import { canTransitionAffiliate } from "../rules";
import { generateReferralCode } from "./referral";
import type { AffiliateProfileInput, ManualAffiliateInput } from "../schemas";
import type { AffiliateStatus } from "../constants";

export type ManageResult =
  | { ok: true; message: string; tempPassword?: string; affiliateId?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createAffiliateManually(input: ManualAffiliateInput, actorUserId: string): Promise<ManageResult> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) return { ok: false, error: "That email already has an account.", fieldErrors: { email: "That email already has an account." } };

  // Shown once to the admin, who sends it to the affiliate over a secure channel.
  const tempPassword = `${randomBytes(12).toString("base64url")}7a`;
  const passwordHash = await hashPassword(tempPassword);
  const userId = newId("usr");
  const affiliateId = newId("aff");
  const referralCode = await generateReferralCode();
  const settings = await getProgramSettings();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id: userId, name: input.name, email, emailVerified: true, role: "affiliate" });
      await tx.insert(account).values({ id: newId("acc"), accountId: userId, providerId: "credential", userId, password: passwordHash });
      await tx.insert(affiliate).values({
        id: affiliateId,
        userId,
        displayName: input.name,
        websiteUrl: input.websiteUrl || null,
        status: "approved",
        referralCode,
        notes: input.notes,
        approvedAt: new Date(),
      });
      if (settings) await createDefaultReferralLink(tx, affiliateId, referralCode, settings.websiteUrl);
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "affiliate.created_manually",
        targetType: "affiliate",
        targetId: affiliateId,
        metadata: { email },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "That email already has an account.", fieldErrors: { email: "That email already has an account." } };
    console.error("[affiliates] manual create failed", error);
    return { ok: false, error: "The affiliate could not be created. Try again." };
  }

  return {
    ok: true,
    message: `Created ${input.name}. Share the temporary password below; it is shown once and the affiliate should change it after signing in.`,
    tempPassword,
    affiliateId,
  };
}

export async function suspendAffiliate(affiliateId: string, reason: string, actorUserId: string): Promise<ManageResult> {
  return transition(affiliateId, "suspended", actorUserId, reason);
}

export async function reactivateAffiliate(affiliateId: string, actorUserId: string): Promise<ManageResult> {
  return transition(affiliateId, "approved", actorUserId);
}

async function transition(affiliateId: string, to: AffiliateStatus, actorUserId: string, reason?: string): Promise<ManageResult> {
  try {
    await db.transaction(async (tx) => {
      const [person] = await tx.select().from(affiliate).where(eq(affiliate.id, affiliateId)).for("update");
      if (!person) throw new ManageError("That affiliate no longer exists.");
      if (!canTransitionAffiliate(person.status, to)) {
        throw new ManageError(`An affiliate with status “${person.status}” cannot move to “${to}”.`);
      }
      const now = new Date();
      await tx
        .update(affiliate)
        .set(
          to === "suspended"
            ? { status: to, suspendedAt: now, suspensionReason: reason }
            : { status: to, suspendedAt: null, suspensionReason: null },
        )
        .where(eq(affiliate.id, affiliateId));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: to === "suspended" ? "affiliate.suspended" : "affiliate.reactivated",
        targetType: "affiliate",
        targetId: affiliateId,
        metadata: reason ? { reason } : {},
      });
    });
  } catch (error) {
    if (error instanceof ManageError) return { ok: false, error: error.message };
    console.error("[affiliates] status change failed", error);
    return { ok: false, error: "The status could not be changed. Try again." };
  }
  return { ok: true, message: to === "suspended" ? "Affiliate suspended. Their links stop earning." : "Affiliate reactivated." };
}

export async function updateAffiliateProfile(affiliateId: string, input: AffiliateProfileInput, actorUserId: string): Promise<ManageResult> {
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(affiliate)
        .set({
          displayName: input.displayName,
          websiteUrl: input.websiteUrl || null,
          country: input.country || null,
          notes: input.notes,
        })
        .where(eq(affiliate.id, affiliateId))
        .returning({ id: affiliate.id });
      if (updated.length === 0) throw new ManageError("That affiliate no longer exists.");
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "affiliate.profile_updated",
        targetType: "affiliate",
        targetId: affiliateId,
        metadata: {},
      });
    });
  } catch (error) {
    if (error instanceof ManageError) return { ok: false, error: error.message };
    console.error("[affiliates] profile update failed", error);
    return { ok: false, error: "The profile could not be saved. Try again." };
  }
  return { ok: true, message: "Affiliate profile saved." };
}

export async function setCommissionOverride(affiliateId: string, percent: string, actorUserId: string): Promise<ManageResult> {
  const trimmed = percent.trim();
  const bps = trimmed ? Math.round(Number(trimmed) * 100) : null;
  if (bps !== null && (!Number.isFinite(bps) || bps < 0 || bps > 10000)) {
    return { ok: false, error: "Use a percentage between 0 and 100.", fieldErrors: { overridePercent: "Use a percentage between 0 and 100." } };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.update(affiliate).set({ commissionOverrideBps: bps }).where(eq(affiliate.id, affiliateId));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "affiliate.override_updated",
        targetType: "affiliate",
        targetId: affiliateId,
        metadata: { commissionOverrideBps: bps },
      });
    });
  } catch (error) {
    console.error("[affiliates] override update failed", error);
    return { ok: false, error: "The override could not be saved. Try again." };
  }
  return { ok: true, message: bps === null ? "Override removed. The program rate applies." : `Override set to ${bps / 100}%.` };
}

class ManageError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}
