"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { questionSchema } from "./schemas";
import {
  createQuestion,
  deleteQuestion as deleteQuestionRecord,
  moveQuestion as moveQuestionRecord,
  setQuestionActive,
  updateQuestion,
} from "./server/manage";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";

export async function saveQuestionAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const parsed = questionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = parsed.data.id
    ? await updateQuestion(parsed.data, session.user.id)
    : await createQuestion(parsed.data, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/settings/questions");
  return { ok: true, message: parsed.data.id ? "Question updated." : "Question added." };
}

export async function toggleQuestion(id: string, active: boolean): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const result = await setQuestionActive(id, active, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/settings/questions");
  return { ok: true, message: active ? "Question shown on the application." : "Question hidden." };
}

export async function moveQuestion(id: string, direction: "up" | "down"): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const result = await moveQuestionRecord(id, direction, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/settings/questions");
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const result = await deleteQuestionRecord(id, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/settings/questions");
  return { ok: true, message: "Question deleted." };
}
