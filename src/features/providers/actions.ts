"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";
import { providerConnectionSchema } from "./schemas";
import { disconnectProviderConnection, saveProviderConnection, webhookUrl } from "./server/connections";

export interface ProviderActionState extends SettingsActionState {
  connectionId?: string;
  webhookUrl?: string;
}

export async function connectProviderAction(_state: ProviderActionState, formData: FormData): Promise<ProviderActionState> {
  const session = await requireAdmin();
  const parsed = providerConnectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const result = await saveProviderConnection(parsed.data, session.user.id);
    if (!result.ok) return { error: result.error };
    revalidatePath("/dashboard/providers");
    revalidatePath("/dashboard/providers/events");
    return {
      ok: true,
      message: result.message,
      connectionId: result.id,
      webhookUrl: webhookUrl(parsed.data.provider, result.id),
    };
  } catch (error) {
    console.error("[providers] connect failed", { provider: parsed.data.provider, error });
    return { error: "The provider could not be connected. Try again." };
  }
}

export async function disconnectProviderAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "That connection could not be found." };
  try {
    const result = await disconnectProviderConnection(id, session.user.id);
    if (!result.ok) return { error: result.error };
    revalidatePath("/dashboard/providers");
    revalidatePath("/dashboard/providers/events");
    return { ok: true, message: result.message };
  } catch (error) {
    console.error("[providers] disconnect failed", { connectionId: id, error });
    return { error: "The provider could not be disconnected. Try again." };
  }
}
