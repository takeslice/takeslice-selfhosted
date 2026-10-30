import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { resetPassword as resetPasswordEmail, verifyEmail as verifyEmailEmail } from "@/lib/email/templates";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from "@/features/auth/password";

const OTP_EXPIRES_IN_SECONDS = 10 * 60;
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
const PASSWORD_SETTING_PATHS = new Set(["/sign-up/email", "/email-otp/reset-password", "/reset-password", "/change-password"]);

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
  user: {
    additionalFields: {
      // Assigned by the server only: setup creates the admin, applications create affiliates.
      role: { type: "string", required: false, defaultValue: "affiliate", input: false },
    },
  },
  hooks: {
    // The forms use the same rule, but the API must not accept a weak password either.
    before: createAuthMiddleware(async (ctx) => {
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
          await sendEmail({ ...message, subject: "Your password reset code" });
          return;
        }
        const message = verifyEmailEmail(email, otp, env.APP_URL);
        await sendEmail({ ...message, subject: "Your confirmation code" });
      },
    }),
    nextCookies(), // must stay last: sets cookies from server actions
  ],
});

export type Session = typeof auth.$Infer.Session;
