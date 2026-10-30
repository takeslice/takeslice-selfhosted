import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { instance } from "@/lib/db/schema/instance";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

export const SETUP_COOKIE = "ts_setup";
export const SETUP_COOKIE_MAX_AGE = 60 * 60;

type SetupGlobal = typeof globalThis & { takesliceSetupTokenChecked?: boolean };
const setupGlobal = globalThis as SetupGlobal;

export function hashSetupToken(token: string): string {
  return createHash("sha256").update(`setup:${token}`).digest("hex");
}

function announce(token: string | null): void {
  if (token) {
    console.info(`[setup] Open ${env.APP_URL}/setup and enter this token: ${token}`);
    return;
  }
  console.info(`[setup] Open ${env.APP_URL}/setup and use the SETUP_TOKEN configured in the environment.`);
}

/**
 * Idempotent: creates the singleton and its setup token before the wizard can be used.
 *
 * A generated token is printed once per app boot while setup is incomplete. Rotating it on
 * restart is deliberate: the raw token is never stored, so a restart before setup would
 * otherwise leave the instance with no way to authenticate the wizard.
 */
export async function ensureInstance(): Promise<{ setupCompletedAt: Date | null; setupTokenHash: string | null }> {
  let [row] = await db.select().from(instance).where(eq(instance.id, "default")).limit(1);
  let createdToken: string | null = null;

  if (!row) {
    const token = env.SETUP_TOKEN ?? randomBytes(24).toString("base64url");
    const inserted = await db
      .insert(instance)
      .values({ id: "default", setupTokenHash: hashSetupToken(token) })
      .onConflictDoNothing()
      .returning({ id: instance.id });
    [row] = await db.select().from(instance).where(eq(instance.id, "default")).limit(1);
    if (!row) throw new Error("Could not create the instance row.");
    if (inserted.length > 0 && !env.SETUP_TOKEN) createdToken = token;
  }

  if (!setupGlobal.takesliceSetupTokenChecked) {
    setupGlobal.takesliceSetupTokenChecked = true;

    if (!row.setupCompletedAt) {
      if (createdToken) {
        announce(createdToken);
      } else if (env.SETUP_TOKEN) {
        // Lets an operator recover a stuck instance by adding SETUP_TOKEN and restarting.
        const tokenHash = hashSetupToken(env.SETUP_TOKEN);
        if (row.setupTokenHash !== tokenHash) {
          await db
            .update(instance)
            .set({ setupTokenHash: tokenHash })
            .where(and(eq(instance.id, "default"), isNull(instance.setupCompletedAt)));
          row = { ...row, setupTokenHash: tokenHash };
        }
        announce(null);
      } else {
        // The previous token cannot be recovered from its hash. Rotate and print a new one.
        const token = randomBytes(24).toString("base64url");
        const tokenHash = hashSetupToken(token);
        await db
          .update(instance)
          .set({ setupTokenHash: tokenHash })
          .where(and(eq(instance.id, "default"), isNull(instance.setupCompletedAt)));
        row = { ...row, setupTokenHash: tokenHash };
        announce(token);
      }
    }
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
