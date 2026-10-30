"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, requireAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";
import { listActiveQuestions } from "@/features/questions/server/manage";
import { applicationSchema, decisionSchema } from "@/features/affiliates/schemas";
import { submitApplication } from "./server/apply";
import { approveApplication, rejectApplication } from "./server/review";

export async function applyAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await getSession();
  if (!session) return { error: "Sign in again to submit your application." };
  if (session.user.role !== "affiliate") return { error: "Only partner accounts can apply." };

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = applicationSchema.safeParse({ ...raw, channels: formData.getAll("channels") });
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const questions = await listActiveQuestions();
  const answers: Record<string, string | boolean> = {};
  for (const question of questions) {
    if (question.type === "checkbox") answers[question.id] = formData.get(`q_${question.id}`) === "on";
    else answers[question.id] = String(formData.get(`q_${question.id}`) ?? "");
  }

  const result = await submitApplication(session.user.id, parsed.data, answers);
  if (!result.ok) return result;
  revalidatePath("/partners/dashboard");
  revalidatePath("/dashboard/applications");
  redirect("/partners/dashboard?submitted=1");
}

export async function approveApplicationAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "The application was not found." };
  const result = await approveApplication(id, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/applications");
  revalidatePath(`/dashboard/applications/${id}`);
  revalidatePath("/dashboard/affiliates");
  return { ok: true, message: result.message };
}

export async function rejectApplicationAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "The application was not found." };
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Add a reason before rejecting.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await rejectApplication(id, parsed.data.reason, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/applications");
  revalidatePath(`/dashboard/applications/${id}`);
  revalidatePath("/dashboard/affiliates");
  return { ok: true, message: result.message };
}
