import { expect } from "@playwright/test";
import { test } from "./fixtures";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test("admin signs in, sees the dashboard and signs out", async ({ page }) => {
  test.skip(!email || !password, "ADMIN_EMAIL and ADMIN_PASSWORD are required");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
