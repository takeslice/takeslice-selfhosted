import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function hmacBase64(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Standard Webhooks (used by Polar and Dodo) signs `id.timestamp.body` and sends
 * one or more `v1,<base64>` values. The secret is base64 after the `whsec_` prefix.
 */
export function standardWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) && encoded.length % 4 === 0) {
    return Buffer.from(encoded, "base64");
  }
  return Buffer.from(trimmed, "utf8");
}

export function verifyStandardWebhook(
  secret: string,
  headers: Headers,
  rawBody: string,
  toleranceSeconds = 300,
): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > toleranceSeconds) return false;

  const expected = createHmac("sha256", standardWebhookSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");

  return signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .some((part) => safeEqual(part.slice(3), expected));
}

export function isFreshTimestamp(timestamp: string | null, toleranceSeconds = 300): boolean {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && Math.abs(Date.now() / 1000 - seconds) <= toleranceSeconds;
}
