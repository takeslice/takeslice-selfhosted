import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

function runWorker() {
  execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/worker.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      WORKER_ONCE: "1",
      APP_URL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-secret-value-that-is-long-enough-123",
    },
    stdio: "pipe",
  });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("admin settings", () => {
  test.skip(!email || !password, "ADMIN_EMAIL and ADMIN_PASSWORD are required");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("saves program rules and keeps them after reload", async ({ page }) => {
    await page.goto("/dashboard/settings/program");
    await page.locator("#commissionPercent").fill("25");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Program settings saved.")).toBeVisible();

    await page.reload();
    await expect(page.locator("#commissionPercent")).toHaveValue("25");
  });

  test("uploads a logo and saves branding", async ({ page }) => {
    await page.goto("/dashboard/settings/branding");
    await page.locator("#logo").setInputFiles("tests/e2e/fixtures/logo.png");
    await page.getByRole("button", { name: "Upload logo" }).click();
    await expect(page.getByText("Logo updated.")).toBeVisible();
    await expect(page.locator('img[alt="Acme Labs logo"]')).toBeVisible();

    await page.locator("#brandColor").fill("#ef4444");
    await page.getByRole("button", { name: "Save branding" }).click();
    await expect(page.getByText("Branding saved.")).toBeVisible();
  });

  test("adds, hides and deletes an application question", async ({ page }) => {
    await page.goto("/dashboard/settings/questions");
    await page.locator("#label").fill("Where will you promote us?");
    await page.locator("#type").selectOption("select");
    await page.locator("#options").fill("YouTube\nNewsletter");
    await page.getByLabel("Required").check();
    await page.getByRole("button", { name: "Add question" }).click();

    await expect(page.getByText("Question added.")).toBeVisible();
    await expect(page.getByText("Where will you promote us?").first()).toBeVisible();

    await page.getByRole("button", { name: "Hide question" }).first().click();
    await expect(page.getByText("Question hidden.")).toBeVisible();

    await page.getByRole("button", { name: "Delete question" }).first().click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Question deleted.")).toBeVisible();
    await expect(page.getByText("No custom questions yet.")).toBeVisible();
  });

  test("saves SMTP settings and sends a test through the outbox", async ({ page }) => {
    await page.goto("/dashboard/settings/email");
    await page.locator("#host").fill("smtp.example.com");
    await page.locator("#fromName").fill("Acme Partners");
    await page.locator("#fromEmail").fill("partners@acme.example");
    await page.getByRole("button", { name: "Save email settings" }).click();
    await expect(page.getByText("Email settings saved.")).toBeVisible();

    await page.getByRole("button", { name: "Send test email" }).click();
    await expect(page.getByText(/Test captured in the email outbox/)).toBeVisible();
    await expect(page.getByText(/Last tested/)).toBeVisible();
  });

  test("diagnostics shows a worker check-in and the current queues", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required to run the worker");
    runWorker();

    await page.goto("/dashboard/settings/diagnostics");
    await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    await expect(page.getByText("Background worker is running.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Email delivery" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Commission queues" })).toBeVisible();
  });

  test("generates an AI Setup prompt for the selected provider", async ({ page }) => {
    await page.goto("/dashboard/settings/ai-setup");
    await expect(page.getByRole("heading", { name: "AI Setup" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Endpoints in this release" })).toBeVisible();

    const provider = page.getByLabel("Payment provider");
    const prompt = page.getByLabel("Generated TakeSlice integration prompt");

    await provider.selectOption("custom");
    await expect(prompt).toHaveValue(/No payment-provider webhook is required/);
    await expect(prompt).toHaveValue(/POST https?:\/\/.+\/api\/v1\/conversions/);

    await provider.selectOption("stripe");
    await expect(prompt).toHaveValue(/client_reference_id/);
    await expect(prompt).toHaveValue(/\/api\/webhooks\/stripe\/\{connectionId\}/);
    await expect(prompt).toHaveValue(/Phase 0: Inspect first \(read-only\)/);

    const value = await prompt.inputValue();
    expect(value).not.toMatch(/ts_(live|test)_[A-Za-z0-9]/);
    expect(value).not.toMatch(/whsec_[A-Za-z0-9]/);
    expect(value).not.toMatch(/ENCRYPTION_KEY/);
  });

  test("shows the settings changes in the audit log", async ({ page }) => {
    await page.goto("/dashboard/settings/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByText("Program settings updated").first()).toBeVisible();
    await expect(page.getByText("Logo updated").first()).toBeVisible();

    await page.getByLabel("Search by action or target").fill("branding");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Branding updated").first()).toBeVisible();
  });
});
