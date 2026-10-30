import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, emailSettings } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { layout, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import type { EmailSettingsInput } from "../schemas";

export type EmailUpdateResult =
  | { ok: true; tested: boolean; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveEmailSettings(input: EmailSettingsInput, actorUserId: string): Promise<EmailUpdateResult> {
  const [current] = await db.select().from(emailSettings).where(eq(emailSettings.id, "default")).limit(1);

  let passwordEncrypted = current?.passwordEncrypted ?? null;
  if (input.password) {
    try {
      passwordEncrypted = encryptSecret(input.password);
    } catch {
      return { ok: false, error: "ENCRYPTION_KEY is not configured on the server, so SMTP passwords cannot be stored." };
    }
  }
  if (!input.host) passwordEncrypted = null;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(emailSettings)
        .set({
          host: input.host || null,
          port: input.port,
          secure: input.secure,
          username: input.username || null,
          passwordEncrypted,
          fromName: input.fromName,
          fromEmail: input.fromEmail,
          lastTestedAt: null,
          lastTestError: null,
        })
        .where(eq(emailSettings.id, "default"));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "email.settings_updated",
        targetType: "email_settings",
        targetId: "default",
        metadata: { host: input.host || null, fromEmail: input.fromEmail },
      });
    });
  } catch (error) {
    console.error("[email] settings update failed", error);
    return { ok: false, error: "The email settings could not be saved. Try again." };
  }
  return { ok: true, tested: false, message: input.host ? "Email settings saved." : "Email settings saved. Email is off until you add an SMTP host." };
}

export async function sendTestEmail(to: string, actorUserId: string): Promise<EmailUpdateResult> {
  const message = {
    to,
    subject: "TakeSlice SMTP test",
    html: layout(
      "SMTP test",
      "<p>This message confirms your partner program can send email. Verification codes, password resets and partner notifications will use these settings.</p>",
      env.APP_URL,    ),
    text: "This message confirms your partner program can send email.",
  };

  const result = await sendEmail(message);
  const testedAt = new Date();
  let lastTestError: string | null = null;
  let userMessage: string;

  if (result.status === "sent") {
    userMessage = `Test email sent to ${to}.`;
  } else if (result.status === "outbox") {
    userMessage = `Test captured in the email outbox for ${to}.`;
  } else if (result.status === "not_configured") {
    lastTestError = "No SMTP host is configured.";
    userMessage = "Add and save an SMTP host before testing.";
  } else {
    lastTestError = result.error;
    userMessage = result.error;
  }

  await db.transaction(async (tx) => {
    await tx.update(emailSettings).set({ lastTestedAt: testedAt, lastTestError }).where(eq(emailSettings.id, "default"));
    await tx.insert(auditLog).values({
      id: newId("aud"),
      actorUserId,
      action: "email.test_sent",
      targetType: "email_settings",
      targetId: "default",
      metadata: { status: result.status, to },
    });
  });

  if (result.status === "sent" || result.status === "outbox") return { ok: true, tested: true, message: userMessage };
  return { ok: false, error: userMessage };
}
