import { expect, type Page } from "@playwright/test";
import { connectToTestDatabase } from "./db";
import { test } from "./fixtures";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL and ADMIN_PASSWORD are required");
test.setTimeout(120_000);

async function signInAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function createApiKey(page: Page, suffix: string, mode: "live" | "test" = "live") {
  await page.goto("/dashboard/settings/api-keys");
  await page.getByLabel("Name").fill(`E2E ${suffix}`);
  await page.getByLabel("Mode").selectOption(mode);
  await page.getByRole("button", { name: "Create API key" }).click();
  const key = (await page.getByRole("status").locator("code").textContent())?.trim();
  expect(key).toMatch(new RegExp(`^ts_${mode}_`));
  return key!;
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
  expect(link).toContain("/r/");
  return link!.split("/r/")[1];
}

async function clickLink(page: Page, code: string, query = "") {
  const response = await page.request.get(`/r/${code}${query}`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const location = response.headers().location;
  expect(location).toContain("acme.example");
  return new URL(location).searchParams.get("tscid");
}

test("API tracks clicks, conversions, duplicates and attribution failures", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const name = `Track Tina ${suffix}`;
  const email = `track-${suffix}@example.com`;

  await signInAdmin(page);

  const code = await createAffiliate(page, name, email);
  const apiKey = await createApiKey(page, suffix);

  const script = await page.request.get("/takeslice.js");
  expect(script.status()).toBe(200);
  expect(script.headers()["content-type"]).toContain("application/javascript");
  expect(await script.text()).toContain("client_reference_id");

  const clickId = await clickLink(page, code);
  expect(clickId).toMatch(/^clk_/);
  await page.waitForTimeout(300);

  const auth = { Authorization: `Bearer ${apiKey}` };
  const externalId = `order-${suffix}`;
  const first = await page.request.post("/api/v1/conversions", {
    headers: auth,
    data: { externalId, amountMinor: 4900, clickId },
  });
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.attribution.outcome).toBe("attributed");
  expect(firstBody.attribution.via).toBe("click");
  expect(firstBody.duplicate).toBe(false);

  const duplicate = await page.request.post("/api/v1/conversions", {
    headers: auth,
    data: { externalId, amountMinor: 4900, clickId },
  });
  expect(duplicate.status()).toBe(200);
  const duplicateBody = await duplicate.json();
  expect(duplicateBody.duplicate).toBe(true);
  expect(duplicateBody.id).toBe(firstBody.id);

  const unknown = await page.request.post("/api/v1/conversions", {
    headers: auth,
    data: { externalId: `unknown-${suffix}`, amountMinor: 1000, clickId: "clk_unknownclick1" },
  });
  expect((await unknown.json()).attribution.outcome).toBe("unknown_click");

  const testClickId = await clickLink(page, code, "?ts_mode=test");
  expect(testClickId).toMatch(/^clk_/);
  await page.waitForTimeout(300);
  const wrongMode = await page.request.post("/api/v1/conversions", {
    headers: auth,
    data: { externalId: `mode-${suffix}`, amountMinor: 1000, clickId: testClickId },
  });
  expect((await wrongMode.json()).attribution.outcome).toBe("wrong_mode");

  const wrongCurrency = await page.request.post("/api/v1/conversions", {
    headers: auth,
    data: { externalId: `currency-${suffix}`, amountMinor: 1000, currency: "USD", clickId },
  });
  expect((await wrongCurrency.json()).attribution.outcome).toBe("currency_mismatch");

  const direct = await page.request.post("/api/track/click", {
    headers: { Origin: "https://acme.example" },
    data: { ref: code, landingUrl: "https://acme.example/pricing" },
  });
  expect(direct.status()).toBe(200);
  expect(direct.headers()["access-control-allow-origin"]).toBe("https://acme.example");
  const directBody = await direct.json();
  expect(directBody.clickId).toMatch(/^clk_/);

  const directConversion = await page.request.post("/api/v1/conversions", {
    headers: auth,
    data: { externalId: `direct-${suffix}`, amountMinor: 2500, clickId: directBody.clickId },
  });
  expect((await directConversion.json()).attribution.outcome).toBe("attributed");

  const couponCode = `E2E${suffix}`;
  await page.goto("/dashboard/coupons");
  await page.getByLabel("Affiliate").selectOption({ label: `${name} · ${email}` });
  await page.getByLabel("Code").fill(couponCode);
  await page.getByLabel("Discount note").fill("20% off");
  await page.getByRole("button", { name: "Add coupon" }).click();
  await expect(page.getByText(`Coupon ${couponCode} created`)).toBeVisible();

  const couponConversion = await page.request.post("/api/v1/conversions", {
    headers: auth,
    data: { externalId: `coupon-${suffix}`, amountMinor: 3000, couponCode },
  });
  const couponBody = await couponConversion.json();
  expect(couponBody.attribution.outcome).toBe("attributed");
  expect(couponBody.attribution.via).toBe("coupon");

  const unauthorised = await page.request.post("/api/v1/conversions", {
    headers: { Authorization: "Bearer ts_live_not_a_real_key" },
    data: { externalId: "bad", amountMinor: 100 },
  });
  expect(unauthorised.status()).toBe(401);
});

test("a click outside the attribution window is reported as expired", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required to age the click fixture");

  const suffix = Date.now().toString().slice(-6);
  const name = `Expired Eli ${suffix}`;
  const email = `expired-${suffix}@example.com`;

  await signInAdmin(page);
  const code = await createAffiliate(page, name, email);
  const apiKey = await createApiKey(page, suffix);

  const clickId = await clickLink(page, code);
  expect(clickId).toMatch(/^clk_/);
  await page.waitForTimeout(300);

  const sql = connectToTestDatabase()!;
  try {
    await sql`update "click" set occurred_at = now() - interval '90 days' where id = ${clickId}`;
  } finally {
    await sql.end();
  }

  const response = await page.request.post("/api/v1/conversions", {
    headers: { Authorization: `Bearer ${apiKey}` },
    data: { externalId: `expired-${suffix}`, amountMinor: 1900, clickId },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.attribution.outcome).toBe("expired_click");
  expect(body.attribution.affiliateId).toBeNull();
});
