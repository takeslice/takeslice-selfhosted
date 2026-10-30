import "server-only";

const STRIPE_API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

interface StripeErrorBody {
  error?: { message?: string };
}

export class StripeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeRequestError";
  }
}

async function stripeRequest(path: string, secretKey: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${STRIPE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[providers] Stripe request failed", error);
    throw new StripeRequestError("Stripe could not be reached. Check outbound network access and try again.");
  }

  const raw = await response.text();
  if (raw.length > MAX_RESPONSE_BYTES) throw new StripeRequestError("Stripe returned an unexpectedly large response.");
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = (body as StripeErrorBody | null)?.error?.message;
    throw new StripeRequestError(
      response.status === 401 || response.status === 403
        ? "Stripe rejected the secret key. Check that it belongs to the selected mode."
        : message || `Stripe returned an error (${response.status}).`,
    );
  }
  return body;
}

export async function validateStripeKey(secretKey: string): Promise<boolean> {
  await stripeRequest("/account", secretKey);
  return true;
}

export async function createStripeWebhook(secretKey: string, url: string, events: string[]): Promise<{ id: string; secret: string }> {
  const body = new URLSearchParams();
  body.set("url", url);
  body.set("description", "TakeSlice affiliate tracking");
  for (const event of events) body.append("enabled_events[]", event);
  const response = (await stripeRequest("/webhook_endpoints", secretKey, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })) as { id?: string; secret?: string } | null;
  if (!response?.id || !response.secret) throw new StripeRequestError("Stripe created a webhook but did not return its signing secret.");
  return { id: response.id, secret: response.secret };
}

export async function deleteStripeWebhook(secretKey: string, id: string): Promise<void> {
  try {
    await stripeRequest(`/webhook_endpoints/${encodeURIComponent(id)}`, secretKey, { method: "DELETE" });
  } catch (error) {
    // A missing endpoint is already the desired state.
    console.warn("[providers] Stripe webhook cleanup failed", error instanceof Error ? error.message : "unknown");
  }
}
