"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireAffiliate } from "@/lib/auth/session";
import type { SettingsActionState } from "@/lib/action-state";
import { getAffiliateForUser } from "@/features/affiliates/server/queries";
import { cancelPayout, createPayout, markPayoutPaid, setAffiliatePayoutDetails } from "./server/payouts";

const PAYOUT_METHODS = ["paypal", "bank_transfer", "wise", "other"] as const;
type PayoutMethod = (typeof PAYOUT_METHODS)[number];

function isPayoutMethod(value: string): value is PayoutMethod {
  return (PAYOUT_METHODS as readonly string[]).includes(value);
}

export async function createPayoutAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const affiliateId = String(formData.get("affiliateId") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim();
  if (!affiliateId) return { error: "That affiliate could not be found." };
  if (!method) return { error: "Choose how the payout was sent.", fieldErrors: { method: "Choose a method." } };

  const result = await createPayout(
    affiliateId,
    {
      method,
      reference: String(formData.get("reference") ?? ""),
      note: String(formData.get("note") ?? ""),
    },
    session.user.id,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/payouts");
  revalidatePath(`/dashboard/affiliates/${affiliateId}`);
  return { ok: true, message: "Payout created. Send the transfer, then mark it paid with the reference." };
}

export async function markPayoutPaidAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
  if (!id) return { error: "That payout could not be found." };
  if (!reference) return { error: "Add the transfer reference.", fieldErrors: { reference: "Add the reference." } };

  const paidAt = paidAtRaw ? new Date(`${paidAtRaw}T12:00:00`) : undefined;
  if (paidAt && Number.isNaN(paidAt.getTime())) return { error: "Check the paid date.", fieldErrors: { paidAt: "Use a valid date." } };

  const result = await markPayoutPaid(id, { reference, paidAt }, session.user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/payouts");
  revalidatePath(`/dashboard/payouts/${id}`);
  return { ok: true, message: result.message };
}

export async function cancelPayoutAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "That payout could not be found." };
  const result = await cancelPayout(id, session.user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/payouts");
  revalidatePath(`/dashboard/payouts/${id}`);
  return { ok: true, message: result.message };
}

export async function savePayoutDetailsAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAffiliate();
  const person = await getAffiliateForUser(session.user.id);
  if (!person) return { error: "Your partner profile could not be found." };

  const method = String(formData.get("method") ?? "");
  const details = String(formData.get("details") ?? "");
  if (!isPayoutMethod(method)) return { error: "Choose a payout method.", fieldErrors: { method: "Choose a method." } };
  if (!details.trim()) return { error: "Add your payout details.", fieldErrors: { details: "Add the account or address to pay." } };

  const result = await setAffiliatePayoutDetails(person.id, { method, details });
  if (!result.ok) return { error: result.error };

  revalidatePath("/partners/dashboard/earnings");
  return { ok: true, message: result.message };
}
