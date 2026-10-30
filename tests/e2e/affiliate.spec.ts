import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OUTBOX = process.env.EMAIL_OUTBOX_DIR ?? "/tmp/takeslice-outbox";

test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL and ADMIN_PASSWORD are required");

test.setTimeout(120_000);

async function latestOtp(to: string): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const files = (await readdir(OUTBOX)).sort().reverse();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await readFile(path.join(OUTBOX, file), "utf8");
      const message = JSON.parse(raw) as { to?: string; subject?: string; text?: string };
      if (message.to === to && message.subject === "Your confirmation code") {
        const match = message.text?.match(/\b(\d{6})\b/);
        if (match) return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No confirmation code for ${to} in ${OUTBOX}`);
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("apply, approve, and see the affiliate dashboard", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const email = `partner-${suffix}@example.com`;
  const displayName = `Pat Partner ${suffix}`;
  const password = "partner-pass-1";

  await page.goto("/partners");
  await expect(page.getByRole("heading", { name: /Earn .* recommending Acme Labs/ })).toBeVisible();

  await page.goto("/partners/signup");
  await page.getByLabel("Your name").fill("Pat Partner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email\?email=/);
  const otp = await latestOtp(email);
  await page.getByLabel("Confirmation code").fill(otp);
  await page.getByRole("button", { name: "Confirm email" }).click();

  await expect(page).toHaveURL(/\/partners\/login\?verified=1/);
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/partners\/apply$/);

  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Website or main channel URL").fill("https://pat.example");
  await page.getByRole("checkbox", { name: "YouTube" }).check();
  await page.getByLabel("How will you promote it?").fill("I make weekly video tutorials for developers and share them on YouTube.");
  await page.getByLabel(/I accept the program terms/).check();
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page).toHaveURL(/\/partners\/dashboard\?submitted=1$/);
  await expect(page.getByText("Application submitted. The business will review it")).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(`Hi, ${displayName}`) })).toBeVisible();
  await expect(page.getByText("Application under review")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/partners\/login$/);

  await page.goto("/login");
  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/dashboard/applications");
  await page.getByRole("link", { name: displayName }).first().click();
  await expect(page.getByRole("heading", { name: displayName })).toBeVisible();
  await page.getByRole("button", { name: "Approve application" }).click();
  await expect(page.getByRole("heading", { name: "Decision" })).toBeVisible();
  await expect(page.getByText(/Approved on/)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/partners/login");
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/partners\/dashboard$/);
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your referral link" })).toBeVisible();
  await expect(page.getByText(/Referral code/)).toBeVisible();
});

test("admin adds an affiliate manually, then suspends and reactivates them", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const email = `manual-${suffix}@example.com`;
  const name = `Manual Mona ${suffix}`;

  await page.goto("/login");
  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/dashboard/affiliates/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Website").fill("https://mona.example");
  await page.getByLabel("Internal notes").fill("Added from a conference.");
  await page.getByRole("button", { name: "Create affiliate" }).click();

  await expect(page.getByRole("heading", { name: "Affiliate created" })).toBeVisible();
  const tempPassword = (await page.locator("code").first().textContent())?.trim();
  expect(tempPassword).toBeTruthy();

  await page.getByRole("link", { name: "Open affiliate" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByRole("button", { name: "Suspend affiliate" }).click();
  await page.getByLabel("Reason").fill("Repeated policy breaches.");
  await page.getByRole("button", { name: "Suspend affiliate" }).click();
  await expect(page.getByText("Suspended: Repeated policy breaches.")).toBeVisible();

  await page.getByRole("button", { name: "Reactivate affiliate" }).click();
  await expect(page.getByRole("button", { name: "Suspend affiliate" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/partners/login");
  await signIn(page, email, tempPassword!);
  await expect(page).toHaveURL(/\/partners\/dashboard$/);
  await expect(page.getByRole("heading", { name: new RegExp(`Hi, ${name}`) })).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
});

test("a rejected applicant sees the reason and when they can apply again", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const email = `reject-${suffix}@example.com`;
  const displayName = `Rita Rejected ${suffix}`;
  const password = "partner-pass-1";
  const reason = "The channel was too small for this program at this time.";

  await page.goto("/partners/signup");
  await page.getByLabel("Your name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/verify-email\?email=/);
  await page.getByLabel("Confirmation code").fill(await latestOtp(email));
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(page).toHaveURL(/\/partners\/login\?verified=1/);
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/partners\/apply$/);

  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Website or main channel URL").fill("https://rita.example");
  await page.getByRole("checkbox", { name: "Newsletter" }).check();
  await page.getByLabel("How will you promote it?").fill("I write a small weekly newsletter about productivity tools.");
  await page.getByLabel(/I accept the program terms/).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page).toHaveURL(/\/partners\/dashboard\?submitted=1$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login");
  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/dashboard/applications");
  await page.getByRole("link", { name: displayName }).first().click();
  await page.getByLabel("Reason").fill(reason);
  await page.getByRole("button", { name: "Reject application" }).click();
  await expect(page.getByRole("heading", { name: "Decision" })).toBeVisible();
  await expect(page.getByText(/Not approved on/)).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/partners/login");
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/partners\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Application not approved" })).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();

  await page.getByRole("link", { name: "Check if you can apply again" }).click();
  await expect(page.getByRole("heading", { name: "Application status" })).toBeVisible();
  await expect(page.getByText(/can apply again from/)).toBeVisible();
});
