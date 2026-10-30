"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";
import {
  affiliateProfileSchema,
  manualAffiliateSchema,
  overrideSchema,
  suspensionSchema,
} from "./schemas";
import {
  createAffiliateManually,
  reactivateAffiliate,
  setCommissionOverride,
  suspendAffiliate,
  updateAffiliateProfile,
} from "./server/manage";

export interface ManageActionState extends SettingsActionState {
  tempPassword?: string;
  affiliateId?: string;
}

export async function createAffiliateAction(_state: ManageActionState, formData: FormData): Promise<ManageActionState> {
  const session = await requireAdmin();
  const parsed = manualAffiliateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await createAffiliateManually(parsed.data, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/affiliates");
  return { ok: true, message: result.message, tempPassword: result.tempPassword, affiliateId: result.affiliateId };
}

export async function saveAffiliateAction(_state: ManageActionState, formData: FormData): Promise<ManageActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "The affiliate was not found." };
  const parsed = affiliateProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await updateAffiliateProfile(id, parsed.data, session.user.id);
  if (!result.ok) return result;
  revalidatePath(`/dashboard/affiliates/${id}`);
  return { ok: true, message: result.message };
}

export async function saveOverrideAction(_state: ManageActionState, formData: FormData): Promise<ManageActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "The affiliate was not found." };
  const parsed = overrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the override.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await setCommissionOverride(id, parsed.data.overridePercent ?? "", session.user.id);
  if (!result.ok) return result;
  revalidatePath(`/dashboard/affiliates/${id}`);
  return { ok: true, message: result.message };
}

export async function suspendAffiliateAction(_state: ManageActionState, formData: FormData): Promise<ManageActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "The affiliate was not found." };
  const parsed = suspensionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Add a reason before suspending.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await suspendAffiliate(id, parsed.data.reason, session.user.id);
  if (!result.ok) return result;
  revalidatePath(`/dashboard/affiliates/${id}`);
  revalidatePath("/dashboard/affiliates");
  return { ok: true, message: result.message };
}

export async function reactivateAffiliateAction(_state: ManageActionState, formData: FormData): Promise<ManageActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "The affiliate was not found." };
  const result = await reactivateAffiliate(id, session.user.id);
  if (!result.ok) return result;
  revalidatePath(`/dashboard/affiliates/${id}`);
  revalidatePath("/dashboard/affiliates");
  return { ok: true, message: result.message };
}
