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

export async function createStripeCoupon(
  secretKey: string,
  input: { code: string; percentOff: number; localCouponId: string },
): Promise<{ couponId: string; promotionId: string }> {
  const couponBody = new URLSearchParams();
  couponBody.set("percent_off", String(input.percentOff));
  couponBody.set("duration", "forever");
  couponBody.set("name", `TakeSlice ${input.code}`);
  couponBody.set("metadata[takeslice_coupon_id]", input.localCouponId);
  const coupon = (await stripeRequest("/coupons", secretKey, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `takeslice-coupon-${input.localCouponId}`,
    },
    body: couponBody,
  })) as { id?: string } | null;
  if (!coupon?.id) throw new StripeRequestError("Stripe created a coupon but did not return its ID.");

  const promotionBody = new URLSearchParams();
  promotionBody.set("promotion[type]", "coupon");
  promotionBody.set("promotion[coupon]", coupon.id);
  promotionBody.set("code", input.code);
  promotionBody.set("active", "true");
  const promotion = (await stripeRequest("/promotion_codes", secretKey, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `takeslice-promotion-${input.localCouponId}`,
    },
    body: promotionBody,
  })) as { id?: string } | null;
  if (!promotion?.id) throw new StripeRequestError("Stripe created a promotion code but did not return its ID.");
  return { couponId: coupon.id, promotionId: promotion.id };
}

export async function setStripePromotionCodeActive(secretKey: string, promotionId: string, active: boolean): Promise<void> {
  const body = new URLSearchParams();
  body.set("active", active ? "true" : "false");
  await stripeRequest(`/promotion_codes/${encodeURIComponent(promotionId)}`, secretKey, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}
