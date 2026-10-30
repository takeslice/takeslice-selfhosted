"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { emailSettingsSchema } from "./schemas";
import { saveEmailSettings, sendTestEmail } from "./server/update";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";

export async function saveEmailSettingsAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const parsed = emailSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await saveEmailSettings(parsed.data, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/settings/email");
  return { ok: true, message: result.message };
}

export async function sendTestEmailAction(state: SettingsActionState): Promise<SettingsActionState> {
  void state;
  const session = await requireAdmin();
  const result = await sendTestEmail(session.user.email, session.user.id);
  revalidatePath("/dashboard/settings/email");
  if (!result.ok) return { error: result.error };
  return { ok: true, message: result.message };
}
