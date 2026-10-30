import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { connectToTestDatabase } from "./db";
import { test } from "./fixtures";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL and ADMIN_PASSWORD are required");
test.skip(!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEY, "DATABASE_URL and ENCRYPTION_KEY are required to seed provider connections");
test.setTimeout(120_000);

function encryptSecret(value: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

async function signInAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function createAffiliate(page: Page, name: string, email: string) {
  await page.goto("/dashboard/affiliates/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Website").fill("https://acme.example/creator");
  await page.getByRole("button", { name: "Create affiliate" }).click();
  await expect(page.getByRole("heading", { name: "Affiliate created" })).toBeVisible();
  await page.getByRole("link", { name: "Open affiliate" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const link = (await page.locator("code").filter({ hasText: "/r/" }).first().textContent())?.trim();
  return link!.split("/r/")[1];
}

function standardHeaders(body: string, rawSecret: string, id: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", rawSecret).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  };
}

function stripeHeaders(body: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    "content-type": "application/json",
    "stripe-signature": `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`,
  };
}

function paddleHeaders(body: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    "content-type": "application/json",
    "paddle-signature": `ts=${timestamp};h1=${createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex")}`,
  };
}
async function deliver(provider: string, connectionId: string, body: string, headers: Record<string, string>) {
  const response = await fetch(`${BASE_URL}/api/webhooks/${provider}/${connectionId}`, { method: "POST", headers, body });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

interface ProviderFixture {
  provider: string;
  secret: string;
  body: string;
  headers: Record<string, string>;
}

function fixtures(clickId: string, currency: string, suffix: string): ProviderFixture[] {
  const now = new Date().toISOString();
  const nowSeconds = Math.floor(Date.now() / 1000);

  const stripeSecret = `whsec_stripe_${suffix}`;
  const stripeBody = JSON.stringify({
    id: `evt_stripe_${suffix}`,
    type: "checkout.session.completed",
    created: nowSeconds,
    data: {
      object: {
        id: `cs_${suffix}`,
        payment_status: "paid",
        amount_total: 4900,
        currency,
        client_reference_id: clickId,
      },
    },
  });

  const paddleSecret = `pdl_secret_${suffix}`;
  const paddleBody = JSON.stringify({
    event_id: `evt_paddle_${suffix}`,
    event_type: "transaction.completed",
    occurred_at: now,
    data: {
      id: `txn_${suffix}`,
      currency_code: currency,
      custom_data: { tscid: clickId },
      details: { totals: { grand_total: "4900" } },
    },
  });

  const lemonSecret = `lemon_secret_${suffix}`;
  const lemonBody = JSON.stringify({
    meta: { event_name: "order_created", custom_data: { tscid: clickId } },
    data: {
      id: `order_lemon_${suffix}`,
      attributes: { total: 4900, currency, status: "paid", created_at: now, first_order: true },
    },
  });

  const dodoRawSecret = `dodo_secret_${suffix}`;
  const dodoSecret = `whsec_${Buffer.from(dodoRawSecret).toString("base64")}`;
  const dodoBody = JSON.stringify({
    type: "payment.succeeded",
    data: {
      payment_id: `pay_${suffix}`,
      total_amount: 4900,
      currency,
      created_at: now,
      metadata: { tscid: clickId },
    },
  });

  const polarRawSecret = `polar_secret_${suffix}`;
  const polarSecret = `whsec_${Buffer.from(polarRawSecret).toString("base64")}`;
  const polarBody = JSON.stringify({
    type: "order.paid",
    data: {
      id: `order_polar_${suffix}`,
      amount: 4900,
      currency,
      created_at: now,
      metadata: { tscid: clickId },
    },
  });

  const revenueCatSecret = `rc_secret_${suffix}`;
  const revenueCatBody = JSON.stringify({
    event: {
      id: `evt_rc_${suffix}`,
      type: "INITIAL_PURCHASE",
      app_user_id: clickId,
      transaction_id: `txn_rc_${suffix}`,
      purchased_at_ms: Date.now(),
      price: 49,
      currency,
      subscriber_attributes: { tscid: { value: clickId } },
    },
  });

  const shopifySecret = `shopify_secret_${suffix}`;
  const shopifyBody = JSON.stringify({
    id: Number(suffix.slice(-7)) + 8000,
    total_price: "49.00",
    currency,
    created_at: now,
    note_attributes: [{ name: "tscid", value: clickId }],
  });

  const wooSecret = `woo_secret_${suffix}`;
  const wooBody = JSON.stringify({
    id: Number(suffix.slice(-7)) + 7000,
    status: "completed",
    total: "49.00",
    currency,
    date_created_gmt: now.replace("Z", ""),
    meta_data: [{ key: "tscid", value: clickId }],
  });

  return [
    { provider: "stripe", secret: stripeSecret, body: stripeBody, headers: stripeHeaders(stripeBody, stripeSecret) },
    {
      provider: "paddle",
      secret: paddleSecret,
      body: paddleBody,
      headers: paddleHeaders(paddleBody, paddleSecret),
    },
    {
      provider: "lemonsqueezy",
      secret: lemonSecret,
      body: lemonBody,
      headers: {
        "content-type": "application/json",
        "x-signature": createHmac("sha256", lemonSecret).update(lemonBody).digest("hex"),
      },
    },
    { provider: "dodo", secret: dodoSecret, body: dodoBody, headers: standardHeaders(dodoBody, dodoRawSecret, `evt_dodo_${suffix}`) },
    { provider: "polar", secret: polarSecret, body: polarBody, headers: standardHeaders(polarBody, polarRawSecret, `evt_polar_${suffix}`) },
    {
      provider: "revenuecat",
      secret: revenueCatSecret,
      body: revenueCatBody,
      headers: { "content-type": "application/json", authorization: `Bearer ${revenueCatSecret}` },
    },
    {
      provider: "shopify",
      secret: shopifySecret,
      body: shopifyBody,
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": "orders/paid",
        "x-shopify-webhook-id": `evt_shopify_${suffix}`,
        "x-shopify-hmac-sha256": createHmac("sha256", shopifySecret).update(shopifyBody).digest("base64"),
      },
    },
    {
      provider: "woocommerce",
      secret: wooSecret,
      body: wooBody,
      headers: {
        "content-type": "application/json",
        "x-wc-webhook-topic": "order.updated",
        "x-wc-webhook-id": `evt_woo_${suffix}`,
        "x-wc-webhook-signature": createHmac("sha256", wooSecret).update(wooBody).digest("base64"),
      },
    },
  ];
}

test("every provider fixture records a conversion, rejects bad signatures and ignores duplicates", async ({ page }) => {
  const suffix = Date.now().toString().slice(-8);
  const name = `Webhook Wendy ${suffix}`;
  const email = `webhook-${suffix}@example.com`;
  const sql = connectToTestDatabase()!;

  try {
    await sql`delete from provider_connection where mode = 'test'`;
    const [settings] = await sql<{ currency: string }[]>`select currency from program_settings where id = 'default'`;
    const currency = settings?.currency ?? "EUR";

    await signInAdmin(page);
    const code = await createAffiliate(page, name, email);

    const redirect = await page.request.get(`/r/${code}?ts_mode=test`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    const clickId = new URL(redirect.headers().location).searchParams.get("tscid");
    expect(clickId).toMatch(/^clk_/);
    await page.waitForTimeout(300);

    const seeded = new Map<string, string>();
    for (const fixture of fixtures(clickId!, currency, suffix)) {
      const connectionId = `pcx_e2e_${fixture.provider}_${suffix}`;
      seeded.set(fixture.provider, connectionId);
      await sql`
        insert into provider_connection (id, provider, mode, status, credentials_encrypted, webhook_secret_encrypted, credential_hint)
        values (${connectionId}, ${fixture.provider}, 'test', 'active', ${encryptSecret("{}")}, ${encryptSecret(fixture.secret)}, ${"e2e…"})
      `;
    }

    const fixturesByProvider = new Map(fixtures(clickId!, currency, suffix).map((fixture) => [fixture.provider, fixture]));
    const ids = new Map<string, string>();

    for (const [provider, connectionId] of seeded) {
      const fixture = fixturesByProvider.get(provider)!;
      const result = await deliver(provider, connectionId, fixture.body, fixture.headers);
      expect(result.status, `${provider} delivery: ${JSON.stringify(result.body)}`).toBe(200);
      expect(result.body.outcome, provider).toBe("processed");
      expect(result.body.conversionId, provider).toEqual(expect.any(String));
      expect((result.body.attribution as { outcome?: string } | null)?.outcome, provider).toBe("attributed");
      ids.set(provider, String(result.body.conversionId));
    }

    const stripe = fixturesByProvider.get("stripe")!;
    const duplicate = await deliver("stripe", seeded.get("stripe")!, stripe.body, stripe.headers);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(duplicate.body.conversionId).toBe(ids.get("stripe"));

    const tampered = await deliver("stripe", seeded.get("stripe")!, stripe.body, {
      ...stripe.headers,
      "stripe-signature": "t=1,v1=deadbeef",
    });
    expect(tampered.status).toBe(401);

    const unknown = await deliver("stripe", "pcx_missing", stripe.body, stripe.headers);
    expect(unknown.status).toBe(404);

    const [count] = await sql<{ count: string }[]>`
      select count(*)::text as count from conversion where provider_connection_id = ${seeded.get("stripe")!}
    `;
    expect(count.count).toBe("1");

    await page.goto("/dashboard/providers/events");
    await expect(page.getByRole("heading", { name: "Provider events" })).toBeVisible();
    await expect(page.getByText("Processed").first()).toBeVisible();
    await expect(page.getByText("Stripe").first()).toBeVisible();
    await expect(page.getByText("Duplicate").first()).toBeVisible();
  } finally {
    await sql.end();
  }
});
