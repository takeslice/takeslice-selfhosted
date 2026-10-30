import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Infrastructure-only environment. Tenant configuration (business name, SMTP, providers,
 * commission rules) lives in the database and is editable after setup.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    APP_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    /** 32 random bytes, base64. Encrypts provider credentials and payout details at rest. */
    ENCRYPTION_KEY: z
      .string()
      .refine((value) => Buffer.from(value, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64-encoded")
      .optional(),
    /** Optional fixed setup token. When unset the app generates one on first boot. */
    SETUP_TOKEN: z.string().min(16).optional(),
    PORT: z.coerce.number().int().positive().default(3000),
    /** Set when a reverse proxy terminates TLS in front of the app. */
    TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SENTRY_DSN: z.url().optional(),
    /** Test-only: write emails as JSON files to this folder instead of sending them. */
    EMAIL_OUTBOX_DIR: z.string().optional(),
  },
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION) || process.env.NEXT_PHASE === "phase-production-build",
});
