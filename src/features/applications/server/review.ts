import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, affiliateApplication, auditLog, user } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { applicationApproved, applicationRejected } from "@/lib/email/templates";
import { getProgramSettings } from "@/features/program/server/settings";
import { generateReferralCode } from "@/features/affiliates/server/referral";
import { canTransitionAffiliate } from "@/features/affiliates/rules";
import { createDefaultReferralLink } from "@/features/links/server/links";
import type { AffiliateStatus } from "@/features/affiliates/constants";

export type ReviewResult =
  | { ok: true; message: string; emailStatus: string }
  | { ok: false; error: string };

export async function approveApplication(
  applicationId: string,
  actorUserId: string,
  options: { automatic?: boolean } = {},
): Promise<ReviewResult> {
  let applicantEmail = "";
  let applicantName = "";
  const settings = await getProgramSettings();

  try {
    const referralCode = await generateReferralCode();

    await db.transaction(async (tx) => {
      const [application] = await tx.select().from(affiliateApplication).where(eq(affiliateApplication.id, applicationId)).for("update");
      if (!application) throw new ReviewError("That application no longer exists.");
      if (application.status !== "pending") throw new ReviewError("That application has already been decided.");

      const [person] = await tx.select().from(affiliate).where(eq(affiliate.id, application.affiliateId)).for("update");
      if (!person) throw new ReviewError("The applicant record is missing.");
      const [account] = await tx.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, person.userId)).limit(1);
      if (!account) throw new ReviewError("The applicant account is missing.");
      if (!canTransitionAffiliate(person.status as AffiliateStatus, "approved")) {
        throw new ReviewError(`An affiliate with status “${person.status}” cannot be approved.`);
      }

      applicantEmail = account.email;
      applicantName = person.displayName;
      const now = new Date();
      const finalCode = person.referralCode ?? referralCode;

      await tx
        .update(affiliateApplication)
        .set({ status: "approved", decidedByUserId: actorUserId, decidedAt: now, decisionReason: null })
        .where(eq(affiliateApplication.id, applicationId));

      await tx
        .update(affiliate)
        .set({
          status: "approved",
          referralCode: finalCode,
          approvedAt: person.approvedAt ?? now,
          rejectedAt: null,
          suspendedAt: null,
          suspensionReason: null,
        })
        .where(eq(affiliate.id, person.id));

      await createDefaultReferralLink(tx, person.id, finalCode, settings?.websiteUrl ?? env.APP_URL);

      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: options.automatic ? "application.auto_approved" : "application.approved",
        targetType: "affiliate_application",
        targetId: applicationId,
        metadata: { affiliateId: person.id },
      });
    });
  } catch (error) {
    if (error instanceof ReviewError) return { ok: false, error: error.message };
    console.error("[applications] approve failed", error);
    return { ok: false, error: "The application could not be approved. Try again." };
  }

  const email = await sendEmail(applicationApproved(applicantEmail, settings?.programName ?? "the partner program", env.APP_URL));
  if (email.status === "failed") console.error(`[applications] approval email failed for ${applicantEmail}`);
  return {
    ok: true,
    message:
      email.status === "sent" || email.status === "outbox"
        ? `Approved ${applicantName}. They have been emailed.`
        : `Approved ${applicantName}. Email is not configured or failed, so tell them directly.`,
    emailStatus: email.status,
  };
}

export async function rejectApplication(applicationId: string, reason: string, actorUserId: string): Promise<ReviewResult> {
  let applicantEmail = "";
  let applicantName = "";

  try {
    await db.transaction(async (tx) => {
      const [application] = await tx.select().from(affiliateApplication).where(eq(affiliateApplication.id, applicationId)).for("update");
      if (!application) throw new ReviewError("That application no longer exists.");
      if (application.status !== "pending") throw new ReviewError("That application has already been decided.");

      const [person] = await tx.select().from(affiliate).where(eq(affiliate.id, application.affiliateId)).for("update");
      if (!person) throw new ReviewError("The applicant record is missing.");
      const [account] = await tx.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, person.userId)).limit(1);
      if (!account) throw new ReviewError("The applicant account is missing.");
      if (!canTransitionAffiliate(person.status as AffiliateStatus, "rejected")) {
        throw new ReviewError(`An affiliate with status “${person.status}” cannot be rejected.`);
      }

      applicantEmail = account.email;
      applicantName = person.displayName;
      const now = new Date();

      await tx
        .update(affiliateApplication)
        .set({ status: "rejected", decidedByUserId: actorUserId, decidedAt: now, decisionReason: reason })
        .where(eq(affiliateApplication.id, applicationId));

      await tx
        .update(affiliate)
        .set({ status: "rejected", rejectedAt: now })
        .where(eq(affiliate.id, person.id));

      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "application.rejected",
        targetType: "affiliate_application",
        targetId: applicationId,
        metadata: { affiliateId: person.id, reason },
      });
    });
  } catch (error) {
    if (error instanceof ReviewError) return { ok: false, error: error.message };
    console.error("[applications] reject failed", error);
    return { ok: false, error: "The application could not be rejected. Try again." };
  }

  const settings = await getProgramSettings();
  const email = await sendEmail(applicationRejected(applicantEmail, settings?.programName ?? "the partner program", reason, env.APP_URL));
  if (email.status === "failed") console.error(`[applications] rejection email failed for ${applicantEmail}`);
  return {
    ok: true,
    message:
      email.status === "sent" || email.status === "outbox"
        ? `Rejected ${applicantName}. They have been emailed the reason.`
        : `Rejected ${applicantName}. Email is not configured or failed, so tell them directly.`,
    emailStatus: email.status,
  };
}

class ReviewError extends Error {}
