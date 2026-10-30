import { expect } from "@playwright/test";
import { test } from "./fixtures";

/**
 * Runs against a fresh instance. `SETUP_TOKEN` must be set for the server under test.
 */
test("first-run setup creates the admin and signs in", async ({ page }) => {
  const token = process.env.SETUP_TOKEN;
  test.skip(!token, "SETUP_TOKEN is required for the setup test");

  await page.goto("/setup");
  await page.getByLabel("Setup token").fill(token!);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Set up your partner program" })).toBeVisible();

  await page.getByLabel("Business name").fill("Acme Labs");
  await page.getByLabel("Website").fill("https://acme.example");
  await page.getByLabel("Program name").fill("Acme Partners");
  await page.getByLabel("Program URL").fill("acme");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#adminName")).toBeVisible();

  await page.locator("#adminName").fill("Ada Admin");
  await page.locator("#adminEmail").fill("admin@acme.example");
  await page.locator("#adminPassword").fill("correct-horse-1");
  await page.locator("#confirmPassword").fill("correct-horse-1");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#currency")).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#smtpHost")).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/login\?setup=done/);
  await page.getByLabel("Email").fill("admin@acme.example");
  await page.getByLabel("Password").fill("correct-horse-1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});
