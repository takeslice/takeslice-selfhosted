"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";
import { couponSchema } from "./schemas";
import { createCoupon, setCouponStatus, syncCouponToStripe } from "./server/coupons";

export async function createCouponAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const parsed = couponSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await createCoupon(parsed.data, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/coupons");
  return { ok: true, message: result.message ?? `Coupon ${parsed.data.code} created.` };
}

export async function toggleCouponAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "inactive" ? "inactive" : "active";
  if (!id) return { error: "That coupon could not be found." };
  const result = await setCouponStatus(id, status, session.user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard/coupons");
  return { ok: true, message: result.message ?? "Coupon updated." };
}

export async function syncCouponAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "That coupon could not be found." };
  const result = await syncCouponToStripe(id, session.user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard/coupons");
  return { ok: true, message: result.message ?? "Coupon synced." };
}
