import "server-only";
import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { resetPassword as resetPasswordEmail, verifyEmail as verifyEmailEmail } from "@/lib/email/templates";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from "@/features/auth/password";

const OTP_EXPIRES_IN_SECONDS = 10 * 60;
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
const PASSWORD_SETTING_PATHS = new Set(["/sign-up/email", "/email-otp/reset-password", "/reset-password", "/change-password"]);
const DEFAULT_TRUSTED_PROXY_CIDRS = "127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16";
const SIGN_IN_ACCOUNT_WINDOW_SECONDS = 600;
const SIGN_IN_ACCOUNT_MAX = 60;

/**
 * Forwarded headers are only useful behind a proxy. Trusted CIDRs let Better Auth strip the
 * proxy hops from `x-forwarded-for` instead of treating a multi-value chain as unknown, which
 * would otherwise put every client in one shared rate-limit bucket.
 */
const trustedProxies = (env.TRUSTED_PROXY_CIDRS ?? DEFAULT_TRUSTED_PROXY_CIDRS)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function accountRateLimitKey(email: string): string {
  return `sign-in-account:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;
}

export const auth = betterAuth({
  appName: "TakeSlice",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  advanced: {
    ipAddress: {
      trustedProxies,
      ipv6Subnet: 64,
    },
  },
  user: {
    additionalFields: {
      // Assigned by the server only: setup creates the admin, applications create affiliates.
      role: { type: "string", required: false, defaultValue: "affiliate", input: false },
    },
  },
  hooks: {
    // The forms use the same rule, but the API must not accept a weak password either.
    before: createAuthMiddleware(async (ctx) => {
      // A per-account ceiling holds even when an attacker rotates a forwarded address, so
      // spoofing `x-forwarded-for` cannot turn the IP rate limit into unlimited guesses.
      if (ctx.path === "/sign-in/email") {
        const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
        if (email) {
          const attempt = await checkRateLimit(accountRateLimitKey(email), SIGN_IN_ACCOUNT_MAX, SIGN_IN_ACCOUNT_WINDOW_SECONDS, { failClosed: true });
          if (!attempt.allowed) {
            throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in attempts for this account. Try again in a few minutes." });
          }
        }
      }
      // Better Auth sends the confirmation code in a background task, so a delivery error cannot
      // reach the visitor. Refuse sign-up up front instead of creating an account nobody can verify.
      if (ctx.path === "/sign-up/email" && !(await isEmailConfigured())) {
        throw new APIError("SERVICE_UNAVAILABLE", {
          message: "This instance cannot send email yet. Ask the administrator to configure SMTP in Settings > Email.",
        });
      }
      if (!PASSWORD_SETTING_PATHS.has(ctx.path)) return;
      const password: unknown = ctx.body?.password ?? ctx.body?.newPassword;
      const problem = typeof password === "string" ? passwordProblem(password) : "Enter a password.";
      if (problem) throw new APIError("BAD_REQUEST", { code: "WEAK_PASSWORD", message: problem });
    }),
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 20,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 300, max: 5 },
      "/email-otp/send-verification-otp": { window: 300, max: 5 },
      "/email-otp/check-verification-otp": { window: 300, max: 10 },
      "/forget-password": { window: 600, max: 5 },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: 5,
      storeOTP: "hashed",
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "forget-password") {
          const message = resetPasswordEmail(email, otp, env.APP_URL);
          const result = await sendEmail({ ...message, subject: "Your password reset code" });
          // Never throw here: a failure only occurs for existing accounts, so surfacing it
          // would reveal which emails are registered. Log loudly for the operator instead.
          if (result.status === "not_configured" || result.status === "failed") {
            console.error("[auth] password reset code could not be delivered", { reason: result.status });
          }
          return;
        }
        const message = verifyEmailEmail(email, otp, env.APP_URL);
        const result = await sendEmail({ ...message, subject: "Your confirmation code" });
        if (result.status === "not_configured" || result.status === "failed") {
          console.error("[auth] confirmation code could not be delivered", { reason: result.status });
          throw new APIError("SERVICE_UNAVAILABLE", {
            message:
              result.status === "not_configured"
                ? "This instance cannot send email yet. Ask the administrator to configure SMTP in Settings > Email."
                : "The confirmation email could not be sent. Try again shortly or contact the administrator.",
          });
        }
      },
    }),
    nextCookies(), // must stay last: sets cookies from server actions
  ],
});

export type Session = typeof auth.$Infer.Session;
