import "server-only";
import { randomBytes } from "node:crypto";
import { desc, eq, isNull, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiKey } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import type { ApiKeyInput } from "../schemas";

export type ApiKeyResult = { ok: true; id: string; key?: string } | { ok: false; error: string };

export interface AuthenticatedKey {
  id: string;
  name: string;
  mode: "live" | "test";
}

const KEY_BODY_BYTES = 24;

export function apiKeyPrefix(mode: "live" | "test"): string {
  return `ts_${mode}_`;
}

export async function createApiKey(input: ApiKeyInput, actorUserId: string): Promise<ApiKeyResult> {
  const body = randomBytes(KEY_BODY_BYTES).toString("base64url");
  const key = `${apiKeyPrefix(input.mode)}${body}`;
  const id = newId("key");
  try {
    await db.insert(apiKey).values({
      id,
      name: input.name,
      prefix: key.slice(0, 16),
      keyHash: sha256Hex(key),
      mode: input.mode,
      createdByUserId: actorUserId,
    });
    // The plaintext is returned once and never stored.
    return { ok: true, id, key };
  } catch (error) {
    console.error("[api-keys] create failed", error);
    return { ok: false, error: "The API key could not be created. Try again." };
  }
}

export async function listApiKeys() {
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      mode: apiKey.mode,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .orderBy(desc(apiKey.createdAt));
}

export async function revokeApiKey(id: string): Promise<ApiKeyResult> {
  try {
    const updated = await db
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKey.id, id), isNull(apiKey.revokedAt)))
      .returning({ id: apiKey.id });
    if (updated.length === 0) return { ok: false, error: "That key is already revoked or could not be found." };
    return { ok: true, id };
  } catch (error) {
    console.error("[api-keys] revoke failed", error);
    return { ok: false, error: "The key could not be revoked. Try again." };
  }
}

/** Verifies the Bearer token. Returns null for a missing, unknown or revoked key. */
export async function authenticateApiKey(authorization: string | null): Promise<AuthenticatedKey | null> {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const token = match[1];
  if (token.length > 200) return null;

  const [row] = await db
    .select({ id: apiKey.id, name: apiKey.name, mode: apiKey.mode })
    .from(apiKey)
    .where(and(eq(apiKey.keyHash, sha256Hex(token)), isNull(apiKey.revokedAt)))
    .limit(1);
  return row ?? null;
}

/** Best-effort, called after the response is sent so it never delays tracking. */
export async function touchApiKey(id: string): Promise<void> {
  try {
    await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, id));
  } catch (error) {
    console.error("[api-keys] last-used update failed", error);
  }
}
