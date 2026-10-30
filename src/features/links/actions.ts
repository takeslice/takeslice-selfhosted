"use server";

import { revalidatePath } from "next/cache";
import { requireAffiliate } from "@/lib/auth/session";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";
import { getAffiliateForUser } from "@/features/affiliates/server/queries";
import { referralLinkSchema } from "./schemas";
import { archiveLinkForAffiliate, createLinkForAffiliate } from "./server/links";

export async function createAffiliateLinkAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAffiliate();
  const person = await getAffiliateForUser(session.user.id);
  if (!person) return { error: "Your affiliate record could not be found." };

  const parsed = referralLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const result = await createLinkForAffiliate(person.id, parsed.data, session.user.id);
  if (!result.ok) return result;

  revalidatePath("/partners/dashboard/links");
  revalidatePath("/partners/dashboard");
  return { ok: true, message: "Link created. It is ready to share." };
}

export async function archiveAffiliateLinkAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAffiliate();
  const person = await getAffiliateForUser(session.user.id);
  if (!person) return { error: "Your affiliate record could not be found." };
  return archive(person.id, String(formData.get("id") ?? ""), session.user.id);
}

/** Used by a plain form in the link list; failure is visible after the page refreshes. */
export async function archiveAffiliateLinkFormAction(formData: FormData): Promise<void> {
  const session = await requireAffiliate();
  const person = await getAffiliateForUser(session.user.id);
  if (!person) return;
  await archive(person.id, String(formData.get("id") ?? ""), session.user.id);
}

async function archive(affiliateId: string, linkId: string, actorUserId: string): Promise<SettingsActionState> {
  if (!linkId) return { error: "The link could not be found." };
  const result = await archiveLinkForAffiliate(affiliateId, linkId, actorUserId);
  if (!result.ok) return result;
  revalidatePath("/partners/dashboard/links");
  revalidatePath("/partners/dashboard");
  return { ok: true, message: "Link archived. It no longer earns, and its history is kept." };
}
