import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

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
