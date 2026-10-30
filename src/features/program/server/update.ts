import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, programSettings } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { parseMoneyToMinor } from "@/lib/money";
import type { BrandingInput, ProgramSettingsInput } from "../schemas";

export type UpdateResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function updateProgramSettings(input: ProgramSettingsInput, actorUserId: string): Promise<UpdateResult> {
  const minimumPayoutMinor = parseMoneyToMinor(input.minimumPayout, input.currency);
  if (minimumPayoutMinor === null) {
    return { ok: false, error: "Check the amounts below.", fieldErrors: { minimumPayout: "Enter an amount like 50 or 50.00." } };
  }
  const fixedMinor =
    input.rateType === "fixed" ? parseMoneyToMinor(input.commissionFixed ?? "", input.currency) : null;
  if (input.rateType === "fixed" && (!fixedMinor || fixedMinor <= 0)) {
    return { ok: false, error: "Check the commission amount.", fieldErrors: { commissionFixed: "Enter an amount like 10 or 10.00." } };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(programSettings)
        .set({
          businessName: input.businessName,
          websiteUrl: input.websiteUrl,
          programName: input.programName,
          programSlug: input.programSlug,
          description: input.description,
          terms: input.terms,
          supportEmail: input.supportEmail || null,
          currency: input.currency,
          rateType: input.rateType,
          commissionBps: Math.round(input.commissionPercent * 100),
          commissionFixedMinor: fixedMinor,
          attributionDays: input.attributionDays,
          validationDays: input.validationDays,
          holdingDays: input.holdingDays,
          recurringMode: input.recurringMode,
          recurringMonths: input.recurringMode === "months" ? (input.recurringMonths ?? null) : null,
          approvalMode: input.approvalMode,
          couponMode: input.couponMode,
          attributionConflict: input.attributionConflict,
          minimumPayoutMinor,
        })
        .where(eq(programSettings.id, "default"));

      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "program.settings_updated",
        targetType: "program_settings",
        targetId: "default",
        metadata: { programSlug: input.programSlug, currency: input.currency, rateType: input.rateType },
      });
    });
  } catch (error) {
    console.error("[program] settings update failed", error);
    return { ok: false, error: "The settings could not be saved. Check the server logs and try again." };
  }
  return { ok: true };
}

export async function updateBranding(input: BrandingInput, actorUserId: string): Promise<UpdateResult> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(programSettings)
        .set({ brandColor: input.brandColor, hideBranding: input.hideBranding })
        .where(eq(programSettings.id, "default"));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "program.branding_updated",
        targetType: "program_settings",
        targetId: "default",
        metadata: { brandColor: input.brandColor, hideBranding: input.hideBranding },
      });
    });
  } catch (error) {
    console.error("[program] branding update failed", error);
    return { ok: false, error: "The branding could not be saved. Try again." };
  }
  return { ok: true };
}

export async function setLogo(uploadId: string | null, actorUserId: string): Promise<UpdateResult> {
  try {
    await db.transaction(async (tx) => {
      await tx.update(programSettings).set({ logoUploadId: uploadId }).where(eq(programSettings.id, "default"));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: uploadId ? "program.logo_updated" : "program.logo_removed",
        targetType: "program_settings",
        targetId: "default",
        metadata: uploadId ? { uploadId } : {},
      });
    });
  } catch (error) {
    console.error("[program] logo update failed", error);
    return { ok: false, error: "The logo could not be updated. Try again." };
  }
  return { ok: true };
}
