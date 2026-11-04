import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db } from "@/lib/db/client";
import { emailSettings } from "@/lib/db/schema/instance";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailResult =
  | { status: "sent" }
  | { status: "outbox"; path: string }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

export async function getEmailSettings() {
  const [row] = await db.select().from(emailSettings).where(eq(emailSettings.id, "default")).limit(1);
  return row ?? null;
}

/** True when a message could be delivered or captured: the dev outbox, or complete SMTP settings. */
export async function isEmailConfigured(): Promise<boolean> {
  if (env.EMAIL_OUTBOX_DIR) return true;
  const settings = await getEmailSettings();
  return Boolean(settings?.host && settings.fromEmail);
}

/**
 * Sends transactional email through the instance SMTP settings. Never pretends a message was
 * delivered: callers receive `not_configured` or `failed` and must show that to the user.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (env.EMAIL_OUTBOX_DIR) {
    const dir = env.EMAIL_OUTBOX_DIR;
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    await writeFile(path, JSON.stringify(message, null, 2), "utf8");
    return { status: "outbox", path };
  }

  const settings = await getEmailSettings();
  if (!settings?.host || !settings.fromEmail) {
    if (env.NODE_ENV !== "production") console.info(`[email:not-configured] to=${message.to} subject=${message.subject}`);
    return { status: "not_configured" };
  }

  try {
    const transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.username
        ? { user: settings.username, pass: settings.passwordEncrypted ? decryptSecret(settings.passwordEncrypted) : "" }
        : undefined,
    });
    await transport.sendMail({
      from: { name: settings.fromName, address: settings.fromEmail },
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { status: "sent" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown SMTP error";
    console.error(`[email:failed] to=${message.to} error=${detail}`);
    return { status: "failed", error: "The email could not be sent. Check the SMTP settings." };
  }
}

export function layout(title: string, body: string, appUrl: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f7f9;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${body}
    <p style="margin-top:32px;font-size:12px;color:#6b7280">Sent by ${escapeHtml(new URL(appUrl).host)}</p>
  </div>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[character] ?? character;
  });
}
