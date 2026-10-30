"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { programSettings } from "@/lib/db/schema";
import { deleteUpload, storeImage } from "@/features/uploads/server/storage";
import { brandingSchema, programSettingsSchema } from "./schemas";
import { setLogo, updateBranding, updateProgramSettings } from "./server/update";
import { fieldErrorsFrom, type SettingsActionState } from "@/lib/action-state";

export async function saveProgramSettingsAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const parsed = programSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await updateProgramSettings(parsed.data, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/settings/program");
  revalidatePath("/dashboard");
  return { ok: true, message: "Program settings saved." };
}

export async function saveBrandingAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const result = await updateBranding(parsed.data, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/dashboard/settings/branding");
  return { ok: true, message: "Branding saved." };
}

export async function uploadLogoAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const session = await requireAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File)) return { error: "Choose an image file." };

  const stored = await storeImage(file, { uploadedByUserId: session.user.id, visibility: "public" });
  if (!stored.ok) return { error: stored.error };

  const [current] = await db.select({ logoUploadId: programSettings.logoUploadId }).from(programSettings).where(eq(programSettings.id, "default"));
  const result = await setLogo(stored.id, session.user.id);
  if (!result.ok) {
    await deleteUpload(stored.id);
    return result;
  }
  if (current?.logoUploadId) await deleteUpload(current.logoUploadId);

  revalidatePath("/dashboard/settings/branding");
  return { ok: true, message: "Logo updated." };
}

export async function removeLogoAction(state: SettingsActionState): Promise<SettingsActionState> {
  void state;
  const session = await requireAdmin();
  const [current] = await db.select({ logoUploadId: programSettings.logoUploadId }).from(programSettings).where(eq(programSettings.id, "default"));
  const result = await setLogo(null, session.user.id);
  if (!result.ok) return result;
  if (current?.logoUploadId) await deleteUpload(current.logoUploadId);
  revalidatePath("/dashboard/settings/branding");
  return { ok: true, message: "Logo removed." };
}
