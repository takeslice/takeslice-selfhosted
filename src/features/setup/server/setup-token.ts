import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { instance } from "@/lib/db/schema/instance";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

export const SETUP_COOKIE = "ts_setup";
export const SETUP_COOKIE_MAX_AGE = 60 * 60;

export function hashSetupToken(token: string): string {
  return createHash("sha256").update(`setup:${token}`).digest("hex");
}

/** Idempotent: creates the singleton and its setup token once, before the wizard can be used. */
export async function ensureInstance(): Promise<{ setupCompletedAt: Date | null; setupTokenHash: string | null }> {
  const [existing] = await db.select().from(instance).where(eq(instance.id, "default")).limit(1);
  if (existing) return existing;

  const token = env.SETUP_TOKEN ?? randomBytes(24).toString("base64url");
  const tokenHash = hashSetupToken(token);
  await db.insert(instance).values({ id: "default", setupTokenHash: tokenHash }).onConflictDoNothing();
  const [row] = await db.select().from(instance).where(eq(instance.id, "default")).limit(1);
  if (!row) throw new Error("Could not create the instance row.");

  if (!env.SETUP_TOKEN) {
    // Printed once, before the token is hashed in later reads. Operators read it from the logs.
    console.info(`[setup] Open ${env.APP_URL}/setup and enter this token: ${token}`);
  }
  return row;
}

export function tokenMatches(candidate: string, storedHash: string | null): boolean {
  if (!storedHash || candidate.length < 8) return false;
  return safeEqual(hashSetupToken(candidate), storedHash);
}

export async function isSetupComplete(): Promise<boolean> {
  const [row] = await db.select({ setupCompletedAt: instance.setupCompletedAt }).from(instance).where(eq(instance.id, "default")).limit(1);
  return Boolean(row?.setupCompletedAt);
}
