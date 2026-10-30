import "server-only";
import { env } from "@/lib/env";

/**
 * Best-effort client address. Forwarded headers are only trusted when the operator has
 * declared a reverse proxy, otherwise anyone could rotate their own rate-limit bucket.
 */
export function clientAddress(headers: Headers): string {
  if (env.TRUST_PROXY) {
    const forwarded = headers.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "unknown";
}

export function referrerHost(value: string | null): string | null {
  if (!value) return null;
  try {
    const host = new URL(value).host;
    return host.slice(0, 255) || null;
  } catch {
    return null;
  }
}

/** Keeps strings that reach the database bounded without splitting surrogate pairs. */
export function truncate(value: string | null | undefined, length: number): string | null {
  if (!value) return null;
  return Array.from(value).slice(0, length).join("");
}
