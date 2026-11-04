import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, affiliateApplication, auditLog, user } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { addDays } from "@/lib/money";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { applicationReceived, newApplicationForAdmin } from "@/lib/email/templates";
import { getProgramSettings } from "@/features/program/server/settings";
import { listActiveQuestions } from "@/features/questions/server/manage";
import { REAPPLY_COOLDOWN_DAYS } from "@/features/affiliates/constants";
import type { ApplicationInput } from "@/features/affiliates/schemas";
import { canTransitionAffiliate } from "@/features/affiliates/rules";
import { getAdminEmail } from "@/features/affiliates/server/referral";
import { approveApplication } from "./review";

export type ApplyResult =
  | { ok: true; applicationId: string; emailStatus: string; autoApproved?: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type RawAnswers = Record<string, string | boolean>;

export async function submitApplication(userId: string, input: ApplicationInput, rawAnswers: RawAnswers): Promise<ApplyResult> {
  const [account] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  if (!account) return { ok: false, error: "Your account could not be found. Sign in again." };

  const questions = await listActiveQuestions();
  const answers: Record<string, string | boolean> = {};
  const questionSnapshot: { id: string; label: string }[] = [];
  const fieldErrors: Record<string, string> = {};

  for (const question of questions) {
    const raw = rawAnswers[question.id];
    let value: string | boolean | undefined;
    if (question.type === "checkbox") {
      value = raw === true || raw === "on";
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (question.type === "select" && trimmed && !question.options.includes(trimmed)) {
        fieldErrors[`q_${question.id}`] = "Choose one of the listed options.";
      } else if (trimmed.length > (question.type === "textarea" ? 4000 : 1000)) {
        fieldErrors[`q_${question.id}`] = "This answer is too long.";
      } else {
        value = trimmed;
      }
    }
    if (question.required && (value === undefined || value === "" || value === false) && !fieldErrors[`q_${question.id}`]) {
      fieldErrors[`q_${question.id}`] = "This answer is required.";
    }
    if (value !== undefined && value !== "") {
      answers[question.id] = value;
      questionSnapshot.push({ id: question.id, label: question.label });
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "Check the highlighted answers.", fieldErrors };

  const applicationId = newId("app");
  const now = new Date();
  const settings = await getProgramSettings();

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(affiliate).where(eq(affiliate.userId, userId)).limit(1).for("update");
      let affiliateId = existing?.id;
      let status = existing?.status ?? "pending";

      if (existing) {
        const [latest] = await tx
          .select()
          .from(affiliateApplication)
          .where(eq(affiliateApplication.affiliateId, existing.id))
          .orderBy(desc(affiliateApplication.createdAt))
          .limit(1);

        if (latest?.status === "pending") throw new ApplyBlockedError("You already have an application under review.");
        if (existing.status === "approved") throw new ApplyBlockedError("You are already an approved partner.");
        if (existing.status === "suspended") throw new ApplyBlockedError("Your account is suspended. Contact the program owner.");
        if (latest?.status === "rejected" && latest.decidedAt) {
          const eligibleAt = addDays(latest.decidedAt, REAPPLY_COOLDOWN_DAYS);
          if (eligibleAt > now) {
            throw new ApplyBlockedError(`You can apply again from ${eligibleAt.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}.`);
          }
        }
        if (!canTransitionAffiliate(existing.status, "pending") && existing.status !== "pending") {
          throw new ApplyBlockedError("You cannot apply again with the current account status.");
        }
        status = "pending";
        await tx
          .update(affiliate)
          .set({
            displayName: input.displayName,
            websiteUrl: input.websiteUrl,
            channels: input.channels,
            promotionPlan: input.promotionPlan,
            status,
          })
          .where(eq(affiliate.id, existing.id));
      } else {
        affiliateId = newId("aff");
        await tx.insert(affiliate).values({
          id: affiliateId,
          userId,
          displayName: input.displayName,
          websiteUrl: input.websiteUrl,
          channels: input.channels,
          promotionPlan: input.promotionPlan,
          status: "pending",
        });
      }

      await tx.insert(affiliateApplication).values({
        id: applicationId,
        affiliateId: affiliateId!,
        websiteUrl: input.websiteUrl,
        channels: input.channels,
        promotionPlan: input.promotionPlan,
        audience: input.audience,
        answers,
        questionSnapshot,
        termsVersion: settings?.termsVersion ?? 1,
        termsAcceptedAt: now,
        status: "pending",
      });

      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId: userId,
        action: "application.submitted",
        targetType: "affiliate_application",
        targetId: applicationId,
        metadata: { channels: input.channels },
      });
    });
  } catch (error) {
    if (error instanceof ApplyBlockedError) return { ok: false, error: error.message };
    if (isUniqueViolation(error)) return { ok: false, error: "An application is already in progress. Refresh the page." };
    console.error("[applications] submit failed", error);
    return { ok: false, error: "Your application could not be submitted. Try again." };
  }

  const programName = settings?.programName ?? "the partner program";

  if (settings?.approvalMode === "auto") {
    const approved = await approveApplication(applicationId, userId, { automatic: true });
    if (approved.ok) {
      return { ok: true, applicationId, emailStatus: approved.emailStatus, autoApproved: true };
    }
    // The application is stored and stays pending; an admin can still approve it.
    console.error(`[applications] automatic approval failed for ${applicationId}: ${approved.error}`);
  }

  const applicantMessage = applicationReceived(account.email, programName, env.APP_URL);
  const applicantEmail = await sendEmail(applicantMessage);
  const adminEmail = await getAdminEmail();
  if (adminEmail) {
    const adminResult = await sendEmail(newApplicationForAdmin(adminEmail, input.displayName, env.APP_URL));
    if (adminResult.status === "failed" || adminResult.status === "not_configured") {
      console.warn("[applications] could not notify the admin of a new application", { reason: adminResult.status });
    }
  }

  return { ok: true, applicationId, emailStatus: applicantEmail.status };
}

class ApplyBlockedError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}

/** Used by the apply page to explain why the form is closed. */
export type ApplicationEligibility =
  | { canApply: true }
  | { canApply: false; reason: "already_approved" | "under_review" | "suspended" | "cooldown"; eligibleAt?: Date };

export async function applicationEligibility(userId: string): Promise<ApplicationEligibility> {
  const [existing] = await db.select().from(affiliate).where(eq(affiliate.userId, userId)).limit(1);
  if (!existing) return { canApply: true };
  if (existing.status === "approved") return { canApply: false, reason: "already_approved" };
  if (existing.status === "suspended") return { canApply: false, reason: "suspended" };

  const [latest] = await db
    .select()
    .from(affiliateApplication)
    .where(eq(affiliateApplication.affiliateId, existing.id))
    .orderBy(desc(affiliateApplication.createdAt))
    .limit(1);
  if (latest?.status === "pending") return { canApply: false, reason: "under_review" };
  if (latest?.status === "rejected" && latest.decidedAt) {
    const eligibleAt = addDays(latest.decidedAt, REAPPLY_COOLDOWN_DAYS);
    if (eligibleAt > new Date()) return { canApply: false, reason: "cooldown", eligibleAt };
  }
  return { canApply: true };
}

/** Counts used by the admin dashboard and application list. */
export async function countPendingApplications(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(affiliateApplication)
    .where(eq(affiliateApplication.status, "pending"));
  return row?.count ?? 0;
}
