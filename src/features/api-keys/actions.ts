"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";
import { apiKeySchema } from "./schemas";
import { createApiKey, revokeApiKey } from "./server/keys";

export interface ApiKeyActionState extends SettingsActionState {
  apiKey?: string;
}

export async function createApiKeyAction(_state: ApiKeyActionState, formData: FormData): Promise<ApiKeyActionState> {
  const session = await requireAdmin();
  const parsed = apiKeySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await createApiKey(parsed.data, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/settings/api-keys");
  return { ok: true, message: "API key created. Copy it now; it is not shown again.", apiKey: result.key };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await revokeApiKey(id);
  revalidatePath("/dashboard/settings/api-keys");
}
