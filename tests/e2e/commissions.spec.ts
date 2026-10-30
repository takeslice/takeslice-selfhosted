import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { connectToTestDatabase } from "./db";
import { test } from "./fixtures";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL and ADMIN_PASSWORD are required");
test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required to mature and inspect commissions");
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
  await page.getByLabel("Name").fill(`Commission E2E ${suffix}`);
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
  return link!.split("/r/")[1];
}

function runWorker() {
  execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/worker.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      WORKER_ONCE: "1",
      APP_URL: BASE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-secret-value-that-is-long-enough-123",
    },
    stdio: "pipe",
  });
}

test("test-mode commissions never appear as partner earnings or payable money", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const name = `Test Tina ${suffix}`;
  const email = `test-mode-${suffix}@example.com`;

  await signInAdmin(page);
  await page.goto("/dashboard/affiliates/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Website").fill("https://acme.example/creator");
  await page.getByRole("button", { name: "Create affiliate" }).click();
  await expect(page.getByRole("heading", { name: "Affiliate created" })).toBeVisible();
  const tempPassword = (await page.locator("code").first().textContent())?.trim();
  expect(tempPassword).toBeTruthy();
  await page.getByRole("link", { name: "Open affiliate" }).click();
  await expect(page).toHaveURL(/\/dashboard\/affiliates\/aff_/);
  const affiliateId = page.url().match(/\/dashboard\/affiliates\/(aff_[^/?#]+)/)?.[1];
  expect(affiliateId).toMatch(/^aff_/);
  const code = (await page.locator("code").filter({ hasText: "/r/" }).first().textContent())?.trim().split("/r/")[1];
  expect(code).toBeTruthy();

  const apiKey = await createApiKey(page, suffix, "test");
  const clickResponse = await page.request.get(`/r/${code}?ts_mode=test`, { maxRedirects: 0 });
  const clickId = new URL(clickResponse.headers().location).searchParams.get("tscid");
  expect(clickId).toMatch(/^clk_/);
  await page.waitForTimeout(300);

  const externalId = `test-mode-${suffix}`;
  const conversion = await page.request.post("/api/v1/conversions", {
    headers: { Authorization: `Bearer ${apiKey}` },
    data: { externalId, amountMinor: 30_000, clickId },
  });
  expect(conversion.status()).toBe(200);
  const body = await conversion.json();
  expect(body.test).toBe(true);
  expect(body.commissionId).toMatch(/^com_/);

  const sql = connectToTestDatabase()!;
  try {
    const [row] = await sql<{ mode: string; status: string }[]>`
      select mode, status from commission where id = ${body.commissionId}
    `;
    expect(row.mode).toBe("test");

    await page.goto("/dashboard/commissions?mode=test");
    await expect(page.getByRole("link", { name: externalId })).toBeVisible();

    await sql`
      update commission
      set validation_ends_at = now() - interval '1 day',
          available_at = now() - interval '1 day'
      where id = ${body.commissionId}
    `;
    runWorker();

    const [matured] = await sql<{ status: string }[]>`select status from commission where id = ${body.commissionId}`;
    expect(matured.status).toBe("available");

    await page.goto(`/dashboard/affiliates/${affiliateId}`);
    await expect(page.getByRole("button", { name: "Create payout" })).toBeDisabled();

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/partners/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(tempPassword!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/partners\/dashboard$/);

    await page.goto("/partners/dashboard/earnings");
    await expect(page.getByRole("heading", { name: "Earnings" })).toBeVisible();
    await expect(page.getByText("No commissions yet. Share your referral link to start earning.")).toBeVisible();
    await expect(page.getByText(externalId)).toHaveCount(0);
  } finally {
    await sql.end();
  }
});

test("refunds reduce a pending commission once and a full refund declines it", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const name = `Refund Rita ${suffix}`;
  const email = `refund-${suffix}@example.com`;

  await signInAdmin(page);
  const code = await createAffiliate(page, name, email);
  const apiKey = await createApiKey(page, suffix);

  const clickResponse = await page.request.get(`/r/${code}`, { maxRedirects: 0 });
  const clickId = new URL(clickResponse.headers().location).searchParams.get("tscid");
  expect(clickId).toMatch(/^clk_/);
  await page.waitForTimeout(300);

  const conversion = await page.request.post("/api/v1/conversions", {
    headers: { Authorization: `Bearer ${apiKey}` },
    data: { externalId: `refund-${suffix}`, amountMinor: 10_000, clickId },
  });
  const body = await conversion.json();
  expect(body.commissionId).toMatch(/^com_/);

  const sql = connectToTestDatabase()!;
  try {
    const [settings] = await sql<{ currency: string }[]>`select currency from program_settings where id = 'default'`;
    const auth = { Authorization: `Bearer ${apiKey}` };

    const partial = await page.request.post("/api/v1/refunds", {
      headers: auth,
      data: { commissionId: body.commissionId, refundId: `refund-partial-${suffix}`, amountMinor: 4_000, currency: settings.currency },
    });
    expect(partial.status()).toBe(200);
    expect((await partial.json()).duplicate).toBe(false);

    const duplicate = await page.request.post("/api/v1/refunds", {
      headers: auth,
      data: { commissionId: body.commissionId, refundId: `refund-partial-${suffix}`, amountMinor: 4_000, currency: settings.currency },
    });
    expect(duplicate.status()).toBe(200);
    expect((await duplicate.json()).duplicate).toBe(true);

    const [snapshot] = await sql<{ rate_type: string; rate_bps: number | null; rate_fixed_minor: number | null }[]>`
      select rate_type, rate_bps, rate_fixed_minor from commission where id = ${body.commissionId}
    `;
    const expectedAmount =
      snapshot.rate_type === "percent"
        ? Math.round((6_000 * (snapshot.rate_bps ?? 0)) / 10_000)
        : Math.min(snapshot.rate_fixed_minor ?? 0, 6_000);

    const [reduced] = await sql<{ amount_minor: number; refunded_sale_amount_minor: number; status: string }[]>`
      select amount_minor, refunded_sale_amount_minor, status from commission where id = ${body.commissionId}
    `;
    expect(reduced).toMatchObject({ amount_minor: expectedAmount, refunded_sale_amount_minor: 4_000, status: "pending" });

    await page.goto(`/dashboard/commissions/${body.commissionId}`);
    await expect(page.getByText("Refunded sale", { exact: true })).toBeVisible();

    const full = await page.request.post("/api/v1/refunds", {
      headers: auth,
      data: { commissionId: body.commissionId, refundId: `refund-full-${suffix}`, amountMinor: 6_000, currency: settings.currency },
    });
    expect(full.status()).toBe(200);

    const [declined] = await sql<{ amount_minor: number; status: string }[]>`
      select amount_minor, status from commission where id = ${body.commissionId}
    `;
    expect(declined).toMatchObject({ amount_minor: 0, status: "declined" });
  } finally {
    await sql.end();
  }
});

test("a commission matures, becomes a payout and is marked paid", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const name = `Payout Pat ${suffix}`;
  const email = `payout-${suffix}@example.com`;

  await signInAdmin(page);
  const code = await createAffiliate(page, name, email);
  const apiKey = await createApiKey(page, suffix);

  const clickResponse = await page.request.get(`/r/${code}`, { maxRedirects: 0 });
  expect(clickResponse.status()).toBe(302);
  const clickId = new URL(clickResponse.headers().location).searchParams.get("tscid");
  expect(clickId).toMatch(/^clk_/);
  await page.waitForTimeout(300);

  const conversion = await page.request.post("/api/v1/conversions", {
    headers: { Authorization: `Bearer ${apiKey}` },
    data: { externalId: `payout-${suffix}`, amountMinor: 30_000, clickId },
  });
  expect(conversion.status()).toBe(200);
  const body = await conversion.json();
  expect(body.attribution.outcome).toBe("attributed");
  expect(body.commissionId).toMatch(/^com_/);

  const sql = connectToTestDatabase()!;
  try {
    await sql`
      update commission
      set validation_ends_at = now() - interval '1 day',
          available_at = now() - interval '1 day'
      where id = ${body.commissionId}
    `;

    runWorker();

    await page.goto(`/dashboard/commissions/${body.commissionId}`);
    await expect(page.getByText("Available", { exact: true }).first()).toBeVisible();

    await page.goto(`/dashboard/affiliates/${body.attribution.affiliateId}`);
    await expect(page.getByText(/Available/).first()).toBeVisible();
    await page.getByRole("button", { name: "Create payout" }).click();
    await expect(page.getByText(/Payout created/)).toBeVisible();

    const [payout] = await sql<{ id: string }[]>`
      select id from payout where affiliate_id = ${body.attribution.affiliateId} order by created_at desc limit 1
    `;
    expect(payout?.id).toMatch(/^pay_/);

    await page.goto(`/dashboard/payouts/${payout.id}`);
    await page.getByLabel("Transfer reference").fill(`BANK-${suffix}`);
    await page.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText(/This payout is complete/)).toBeVisible();

    const [commissionRow] = await sql<{ status: string }[]>`select status from commission where id = ${body.commissionId}`;
    expect(commissionRow.status).toBe("paid");
    const [payoutRow] = await sql<{ status: string; reference: string }[]>`select status, reference from payout where id = ${payout.id}`;
    expect(payoutRow).toMatchObject({ status: "paid", reference: `BANK-${suffix}` });
  } finally {
    await sql.end();
  }
});

test("cancelling a payout releases the reserved commission", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const name = `Cancel Cora ${suffix}`;
  const email = `cancel-${suffix}@example.com`;

  await signInAdmin(page);
  const code = await createAffiliate(page, name, email);
  const apiKey = await createApiKey(page, suffix);

  const clickResponse = await page.request.get(`/r/${code}`, { maxRedirects: 0 });
  const clickId = new URL(clickResponse.headers().location).searchParams.get("tscid");
  await page.waitForTimeout(300);

  const conversion = await page.request.post("/api/v1/conversions", {
    headers: { Authorization: `Bearer ${apiKey}` },
    data: { externalId: `cancel-${suffix}`, amountMinor: 30_000, clickId },
  });
  const body = await conversion.json();

  const sql = connectToTestDatabase()!;
  try {
    await sql`
      update commission
      set validation_ends_at = now() - interval '1 day',
          available_at = now() - interval '1 day'
      where id = ${body.commissionId}
    `;
    runWorker();

    await page.goto(`/dashboard/affiliates/${body.attribution.affiliateId}`);
    await page.getByRole("button", { name: "Create payout" }).click();
    await expect(page.getByText(/Payout created/)).toBeVisible();

    const [payout] = await sql<{ id: string }[]>`
      select id from payout where affiliate_id = ${body.attribution.affiliateId} order by created_at desc limit 1
    `;
    await page.goto(`/dashboard/payouts/${payout.id}`);
    await page.getByRole("button", { name: "Cancel payout" }).click();
    await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
    await expect(page.getByText("No items are reserved. A cancelled payout releases them.")).toBeVisible();

    const [commissionRow] = await sql<{ status: string }[]>`select status from commission where id = ${body.commissionId}`;
    expect(commissionRow.status).toBe("available");
    const [payoutRow] = await sql<{ status: string }[]>`select status from payout where id = ${payout.id}`;
    expect(payoutRow.status).toBe("cancelled");
  } finally {
    await sql.end();
  }
});

test("a refund after payout creates one negative adjustment", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const name = `Refund Ruben ${suffix}`;
  const email = `paid-refund-${suffix}@example.com`;

  await signInAdmin(page);
  const code = await createAffiliate(page, name, email);
  const apiKey = await createApiKey(page, suffix);

  const clickResponse = await page.request.get(`/r/${code}`, { maxRedirects: 0 });
  const clickId = new URL(clickResponse.headers().location).searchParams.get("tscid");
  await page.waitForTimeout(300);

  const conversion = await page.request.post("/api/v1/conversions", {
    headers: { Authorization: `Bearer ${apiKey}` },
    data: { externalId: `paid-refund-${suffix}`, amountMinor: 30_000, clickId },
  });
  const body = await conversion.json();

  const sql = connectToTestDatabase()!;
  try {
    await sql`
      update commission
      set validation_ends_at = now() - interval '1 day',
          available_at = now() - interval '1 day'
      where id = ${body.commissionId}
    `;
    runWorker();

    await page.goto(`/dashboard/affiliates/${body.attribution.affiliateId}`);
    await page.getByRole("button", { name: "Create payout" }).click();
    await expect(page.getByText(/Payout created/)).toBeVisible();
    const [payout] = await sql<{ id: string }[]>`
      select id from payout where affiliate_id = ${body.attribution.affiliateId} order by created_at desc limit 1
    `;
    await page.goto(`/dashboard/payouts/${payout.id}`);
    await page.getByLabel("Transfer reference").fill(`BANK-REFUND-${suffix}`);
    await page.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText(/This payout is complete/)).toBeVisible();

    const [before] = await sql<{ amount_minor: number; rate_type: string; rate_bps: number | null; rate_fixed_minor: number | null; currency: string }[]>`
      select amount_minor, rate_type, rate_bps, rate_fixed_minor, currency from commission where id = ${body.commissionId}
    `;
    const targetAfterRefund =
      before.rate_type === "percent" ? Math.round((20_000 * (before.rate_bps ?? 0)) / 10_000) : Math.min(before.rate_fixed_minor ?? 0, 20_000);
    const expectedAdjustment = targetAfterRefund - before.amount_minor;

    const refund = await page.request.post("/api/v1/refunds", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { commissionId: body.commissionId, refundId: `paid-${suffix}`, amountMinor: 10_000, currency: before.currency },
    });
    expect(refund.status()).toBe(200);
    expect((await refund.json()).duplicate).toBe(false);

    const duplicate = await page.request.post("/api/v1/refunds", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { commissionId: body.commissionId, refundId: `paid-${suffix}`, amountMinor: 10_000, currency: before.currency },
    });
    expect((await duplicate.json()).duplicate).toBe(true);

    const adjustments = await sql<{ amount_minor: number; status: string }[]>`
      select amount_minor, status from adjustment
      where affiliate_id = ${body.attribution.affiliateId}
      order by created_at desc
    `;
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({ amount_minor: expectedAdjustment, status: "active" });

    const [after] = await sql<{ status: string; amount_minor: number; refunded_sale_amount_minor: number }[]>`
      select status, amount_minor, refunded_sale_amount_minor from commission where id = ${body.commissionId}
    `;
    expect(after).toMatchObject({ status: "paid", amount_minor: before.amount_minor, refunded_sale_amount_minor: 10_000 });
  } finally {
    await sql.end();
  }
});
