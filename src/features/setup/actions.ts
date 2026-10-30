"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setupSchema } from "@/features/setup/schemas";
import { completeSetup } from "@/features/setup/server/complete-setup";
import { SETUP_COOKIE, SETUP_COOKIE_MAX_AGE, ensureInstance, tokenMatches } from "@/features/setup/server/setup-token";
import { env } from "@/lib/env";

export interface SetupActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function verifySetupTokenAction(_state: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const instance = await ensureInstance();
  if (instance.setupCompletedAt) return { error: "This instance is already set up." };
  if (!tokenMatches(token, instance.setupTokenHash)) return { error: "That token is not valid. Check the server logs for the setup token." };

  (await cookies()).set(SETUP_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    path: "/setup",
    maxAge: SETUP_COOKIE_MAX_AGE,
  });
  redirect("/setup");
}

export async function submitSetupAction(_state: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }

  const result = await completeSetup(parsed.data);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  redirect("/login?setup=done");
}
