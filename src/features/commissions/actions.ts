"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import type { SettingsActionState } from "@/lib/action-state";
import { declineCommission, reverseCommission } from "./server/lifecycle";

export async function commissionDecisionAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!id) return { error: "That commission could not be found." };
  if (outcome !== "decline" && outcome !== "reverse") return { error: "Choose a valid decision." };
  if (reason.length < 3) return { error: "Add a reason so the decision can be audited.", fieldErrors: { reason: "Add a short reason." } };

  const result =
    outcome === "decline"
      ? await declineCommission(id, reason.slice(0, 500), session.user.id)
      : await reverseCommission(id, reason.slice(0, 500), session.user.id);

  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard/commissions");
  revalidatePath(`/dashboard/commissions/${id}`);
  return { ok: true, message: result.message };
}
