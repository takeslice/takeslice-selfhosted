"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { setupSchema } from "@/features/setup/schemas";
import { completeSetup } from "@/features/setup/server/complete-setup";
import { SETUP_COOKIE, SETUP_COOKIE_MAX_AGE, ensureInstance, tokenMatches } from "@/features/setup/server/setup-token";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientAddress } from "@/lib/request";

export interface SetupActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const SETUP_ATTEMPT_LIMIT = 10;
const SETUP_ATTEMPT_WINDOW_SECONDS = 60;

async function setupAttemptAllowed(scope: "token" | "submit"): Promise<boolean> {
  const requestHeaders = await headers();
  const rate = await checkRateLimit(
    `setup:${scope}:${clientAddress(requestHeaders)}`,
    SETUP_ATTEMPT_LIMIT,
    SETUP_ATTEMPT_WINDOW_SECONDS,
    { failClosed: true },
  );
  return rate.allowed;
}

export async function verifySetupTokenAction(_state: SetupActionState, formData: FormData): Promise<SetupActionState> {
  if (!(await setupAttemptAllowed("token"))) {
    return { error: "Too many setup attempts. Wait a minute and try again." };
  }
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
  if (!(await setupAttemptAllowed("submit"))) {
    return { error: "Too many setup attempts. Wait a minute and try again." };
  }
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
