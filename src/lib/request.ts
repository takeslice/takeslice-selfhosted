import "server-only";
import { BlockList, isIP } from "node:net";
import { env } from "@/lib/env";

const DEFAULT_TRUSTED_PROXY_CIDRS = "127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16";

const trustedProxies = (env.TRUSTED_PROXY_CIDRS ?? DEFAULT_TRUSTED_PROXY_CIDRS)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const trustedNetwork = new BlockList();
for (const cidr of trustedProxies) {
  const [address, prefix] = cidr.split("/");
  const family = isIP(address);
  if (!family) continue;
  const bits = prefix === undefined ? (family === 4 ? 32 : 128) : Number(prefix);
  const maxBits = family === 4 ? 32 : 128;
  if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) continue;
  trustedNetwork.addSubnet(address, bits, family === 4 ? "ipv4" : "ipv6");
}

function addressFamily(address: string): "ipv4" | "ipv6" | null {
  const family = isIP(address.replace(/^\[|\]$/g, ""));
  return family === 4 ? "ipv4" : family === 6 ? "ipv6" : null;
}

function isTrustedProxy(address: string): boolean {
  const family = addressFamily(address);
  return family ? trustedNetwork.check(address.replace(/^\[|\]$/g, ""), family) : false;
}

/**
 * Best-effort client address. Forwarded headers are only trusted when the operator has
 * declared a reverse proxy, otherwise anyone could rotate their own rate-limit bucket.
 * The chain is walked from the right (closest hop first) and every address inside
 * `TRUSTED_PROXY_CIDRS` is skipped, so a client-supplied prefix cannot become the address.
 */
export function clientAddress(headers: Headers): string {
  if (!env.TRUST_PROXY) return "unknown";
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter((value) => addressFamily(value) !== null);
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      if (!isTrustedProxy(chain[index])) return chain[index];
    }
    if (chain.length > 0) return chain[0];
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real && addressFamily(real) && !isTrustedProxy(real)) return real;
  return "unknown";
}

export type BoundedBodyResult =
  | { ok: true; body: string }
  | { ok: false; reason: "too_large" | "unreadable" };

/**
 * Reads a request body without ever buffering more than `maxBytes`. A `Content-Length`
 * check alone is not enough: chunked requests omit it, so the limit is enforced while
 * streaming and the stream is cancelled as soon as it is exceeded.
 */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<BoundedBodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0) return { ok: false, reason: "too_large" };
    if (length > maxBytes) return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: true, body: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  return { ok: true, body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8") };
}

/**
 * Bucket key for anonymous tracking limits. Only an address derived by `clientAddress` is
 * trusted; raw forwarded headers are never used here because any client can rotate them.
 * `shared` marks the fallback bucket, where callers apply a higher ceiling so ordinary
 * traffic cannot exhaust it. Callers must not put unvalidated path or query values in
 * `scope`, or an attacker can create a new bucket per request.
 */
export function trackingRateLimitKey(scope: string, headers: Headers): { key: string; shared: boolean } {
  const address = clientAddress(headers);
  if (address !== "unknown") return { key: `${scope}:${address}`, shared: false };
  return { key: `${scope}:shared`, shared: true };
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
