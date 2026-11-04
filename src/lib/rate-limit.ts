import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { rateLimit } from "@/lib/db/schema";
import { hmacSha256Hex } from "@/lib/crypto";
import { newId } from "@/lib/ids";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window limiter backed by the shared database, so every app replica sees the same
 * counter. Keys are keyed-hashed here so raw addresses, account identifiers and key
 * prefixes are never stored.
 */
const FAIL_CLOSED_RETRY_SECONDS = 30;

export interface RateLimitOptions {
  /** Deny when the limiter itself is unavailable. Use for brute-force defences, not tracking. */
  failClosed?: boolean;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const storageKey = `rl:${hmacSha256Hex(key)}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const cutoff = now - windowMs;

  try {
    const [row] = await db
      .insert(rateLimit)
      .values({ id: newId("rl"), key: storageKey, count: 1, lastRequest: now })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          count: sql`case when ${rateLimit.lastRequest} <= ${cutoff} then 1 else ${rateLimit.count} + 1 end`,
          lastRequest: sql`case when ${rateLimit.lastRequest} <= ${cutoff} then ${now} else ${rateLimit.lastRequest} end`,
        },
      })
      .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest });

    const count = row?.count ?? 1;
    const lastRequest = row?.lastRequest ?? now;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: count <= limit ? 0 : Math.max(1, Math.ceil((lastRequest + windowMs - now) / 1000)),
    };
  } catch (error) {
    console.error("[rate-limit] check failed", error);
    // Tracking must not take the business site down because the limiter is unavailable, but
    // setup and sign-in must not lose their brute-force protection when the database misbehaves.
    if (options.failClosed) return { allowed: false, remaining: 0, retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS };
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}
