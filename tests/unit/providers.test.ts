import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { dodoAdapter } from "@/features/providers/adapters/dodo";
import { lemonSqueezyAdapter } from "@/features/providers/adapters/lemonsqueezy";
import { paddleAdapter } from "@/features/providers/adapters/paddle";
import { polarAdapter } from "@/features/providers/adapters/polar";
import { revenueCatAdapter } from "@/features/providers/adapters/revenuecat";
import { shopifyAdapter } from "@/features/providers/adapters/shopify";
import { stripeAdapter } from "@/features/providers/adapters/stripe";
import { wooCommerceAdapter } from "@/features/providers/adapters/woocommerce";
import { hmacBase64, hmacHex } from "@/features/providers/signatures";

const click = "clk_e2etest1234";

function stripeHeaders(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  return new Headers({ "stripe-signature": `t=${timestamp},v1=${hmacHex(secret, `${timestamp}.${body}`)}` });
}

function standardHeaders(body: string, rawSecret: string, id = "evt_standard_1") {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", rawSecret).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  });
}

describe("Stripe adapter", () => {
  const secret = "whsec_stripe_fixture";
  const body = JSON.stringify({
    id: "evt_stripe_1",
    type: "checkout.session.completed",
    created: 1_793_395_200,
    data: {
      object: {
        id: "cs_test_123",
        payment_status: "paid",
        amount_total: 4900,
        currency: "eur",
        client_reference_id: click,
        metadata: { ts_coupon_code: "pat20" },
        subscription: null,
      },
    },
  });

  it("verifies and maps a paid checkout", () => {
    const headers = stripeHeaders(body, secret);
    expect(stripeAdapter.verify(body, headers, secret)).toBe(true);
    expect(stripeAdapter.parse(body, headers)).toMatchObject({
      kind: "conversion",
      providerEventId: "evt_stripe_1",
      externalId: "cs_test_123",
      amountMinor: 4900,
      currency: "EUR",
      clickId: click,
      couponCode: "PAT20",
      renewal: false,
    });
  });

  it("rejects a changed body and ignores unpaid sessions", () => {
    const headers = stripeHeaders(body, secret);
    expect(stripeAdapter.verify(`${body} `, headers, secret)).toBe(false);
    const unpaid = body.replace('"payment_status":"paid"', '"payment_status":"unpaid"');
    expect(stripeAdapter.parse(unpaid, headers).kind).toBe("ignored");
  });
});

describe("Paddle adapter", () => {
  const secret = "pdl_fixture_secret";
  const body = JSON.stringify({
    event_id: "evt_paddle_1",
    event_type: "transaction.completed",
    occurred_at: "2026-10-30T12:00:00Z",
    data: {
      id: "txn_123",
      currency_code: "USD",
      origin: "subscription_recurring",
      subscription_id: "sub_1",
      custom_data: { tscid: click },
      details: { totals: { grand_total: "2900" } },
    },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = new Headers({ "paddle-signature": `ts=${timestamp};h1=${hmacHex(secret, `${timestamp}:${body}`)}` });

  it("verifies and maps a recurring transaction", () => {
    expect(paddleAdapter.verify(body, headers, secret)).toBe(true);
    expect(paddleAdapter.parse(body, headers)).toMatchObject({
      kind: "conversion",
      externalId: "txn_123",
      amountMinor: 2900,
      currency: "USD",
      renewal: true,
      clickId: click,
    });
  });

  it("rejects a bad signature", () => {
    expect(paddleAdapter.verify(body, headers, "wrong")).toBe(false);
  });
});

describe("Lemon Squeezy adapter", () => {
  const secret = "lemon_fixture_secret";
  const body = JSON.stringify({
    meta: { event_name: "order_created", custom_data: { tscid: click } },
    data: {
      id: "order_1",
      attributes: { total: 1900, currency: "EUR", status: "paid", created_at: "2026-10-30T12:00:00Z", first_order: true },
    },
  });
  const headers = new Headers({ "x-signature": hmacHex(secret, body) });

  it("verifies and maps an order", () => {
    expect(lemonSqueezyAdapter.verify(body, headers, secret)).toBe(true);
    expect(lemonSqueezyAdapter.parse(body, headers)).toMatchObject({
      kind: "conversion",
      externalId: "order_1",
      amountMinor: 1900,
      currency: "EUR",
      renewal: false,
    });
  });
});

describe("Dodo adapter", () => {
  const rawSecret = "dodo_fixture_secret_with_entropy";
  const secret = `whsec_${Buffer.from(rawSecret).toString("base64")}`;
  const body = JSON.stringify({
    type: "payment.succeeded",
    data: {
      payment_id: "pay_dodo_1",
      total_amount: 3500,
      currency: "GBP",
      created_at: "2026-10-30T12:00:00Z",
      metadata: { tscid: click },
    },
  });
  const headers = standardHeaders(body, rawSecret, "evt_dodo_1");

  it("verifies Standard Webhooks and maps a payment", () => {
    expect(dodoAdapter.verify(body, headers, secret)).toBe(true);
    expect(dodoAdapter.parse(body, headers)).toMatchObject({
      kind: "conversion",
      providerEventId: "evt_dodo_1",
      externalId: "pay_dodo_1",
      amountMinor: 3500,
      currency: "GBP",
    });
  });

  it("rejects an old timestamp", () => {
    const old = standardHeaders(body, rawSecret, "evt_dodo_old");
    old.set("webhook-timestamp", String(Math.floor(Date.now() / 1000) - 600));
    expect(dodoAdapter.verify(body, old, secret)).toBe(false);
  });
});

describe("Polar adapter", () => {
  const rawSecret = "polar_fixture_secret_with_entropy";
  const secret = `whsec_${Buffer.from(rawSecret).toString("base64")}`;
  const body = JSON.stringify({
    type: "order.paid",
    data: {
      id: "order_polar_1",
      amount: 2500,
      currency: "EUR",
      created_at: "2026-10-30T12:00:00Z",
      metadata: { tscid: click },
      billing_reason: "subscription_cycle",
      subscription_id: "sub_polar_1",
    },
  });
  const headers = standardHeaders(body, rawSecret, "evt_polar_1");

  it("verifies and maps a renewal", () => {
    expect(polarAdapter.verify(body, headers, secret)).toBe(true);
    expect(polarAdapter.parse(body, headers)).toMatchObject({
      kind: "conversion",
      externalId: "order_polar_1",
      amountMinor: 2500,
      renewal: true,
    });
  });
});

describe("RevenueCat adapter", () => {
  const secret = "revenuecat_fixture_secret";
  const body = JSON.stringify({
    event: {
      id: "evt_rc_1",
      type: "INITIAL_PURCHASE",
      app_user_id: click,
      transaction_id: "txn_rc_1",
      purchased_at_ms: 1_793_395_200_000,
      price: 19.99,
      currency: "USD",
      subscriber_attributes: { tscid: { value: click } },
    },
  });
  const headers = new Headers({ Authorization: `Bearer ${secret}` });

  it("verifies the authorization header and maps a purchase", () => {
    expect(revenueCatAdapter.verify(body, headers, secret)).toBe(true);
    expect(revenueCatAdapter.parse(body, headers)).toMatchObject({
      kind: "conversion",
      externalId: "txn_rc_1",
      amountMinor: 1999,
      currency: "USD",
    });
  });

  it("rejects a different bearer token", () => {
    expect(revenueCatAdapter.verify(body, headers, "other")).toBe(false);
  });
});

describe("Shopify adapter", () => {
  const secret = "shopify_fixture_secret";
  const body = JSON.stringify({
    id: 9001,
    total_price: "49.00",
    currency: "EUR",
    created_at: "2026-10-30T12:00:00Z",
    note_attributes: [{ name: "tscid", value: click }],
    discount_codes: [{ code: "PAT20" }],
  });
  const headers = new Headers({
    "x-shopify-topic": "orders/paid",
    "x-shopify-hmac-sha256": hmacBase64(secret, body),
    "x-shopify-webhook-id": "evt_shopify_1",
  });

  it("verifies and maps a paid order", () => {
    expect(shopifyAdapter.verify(body, headers, secret)).toBe(true);
    expect(shopifyAdapter.parse(body, headers)).toMatchObject({
      kind: "conversion",
      externalId: "9001",
      amountMinor: 4900,
      currency: "EUR",
      clickId: click,
      couponCode: "PAT20",
    });
  });
});

describe("WooCommerce adapter", () => {
  const secret = "woo_fixture_secret";
  const body = JSON.stringify({
    id: 7001,
    status: "completed",
    total: "31.50",
    currency: "GBP",
    date_created_gmt: "2026-10-30T12:00:00",
    meta_data: [{ key: "tscid", value: click }],
    coupon_lines: [{ code: "pat20" }],
  });
  const headers = new Headers({
    "x-wc-webhook-topic": "order.updated",
    "x-wc-webhook-signature": hmacBase64(secret, body),
    "x-wc-webhook-id": "evt_woo_1",
  });

  it("verifies and maps a paid order", () => {
    expect(wooCommerceAdapter.verify(body, headers, secret)).toBe(true);
    expect(wooCommerceAdapter.parse(body, headers)).toMatchObject({
      kind: "conversion",
      externalId: "7001",
      amountMinor: 3150,
      currency: "GBP",
      clickId: click,
      couponCode: "PAT20",
    });
  });

  it("ignores an unpaid order", () => {
    const unpaid = body.replace('"status":"completed"', '"status":"pending"');
    expect(wooCommerceAdapter.parse(unpaid, headers).kind).toBe("ignored");
  });
});
