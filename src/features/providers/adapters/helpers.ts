import { createHash } from "node:crypto";
import { parseMoneyToMinor } from "@/lib/money";

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

export function read(record: JsonRecord | null, ...path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    const next = asRecord(current);
    if (!next) return undefined;
    current = next[key];
  }
  return current;
}

export function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function bool(value: unknown): boolean {
  return value === true || value === "true";
}

export function parseJson(rawBody: string): JsonRecord | null {
  try {
    return asRecord(JSON.parse(rawBody));
  } catch {
    return null;
  }
}

export function parseDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Provider APIs differ: Paddle sends minor units, Shopify sends a decimal string. */
export function integerMinor(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

export function decimalMinor(value: unknown, currency: string): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return parseMoneyToMinor(value.toFixed(2), currency);
  }
  if (typeof value === "string") return parseMoneyToMinor(value, currency);
  return null;
}

export function currencyCode(value: unknown): string | null {
  const code = text(value)?.toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : null;
}

const CLICK_ID_PATTERN = /^clk_[A-Za-z0-9_-]{6,80}$/;
const COUPON_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

export function clickId(value: unknown): string | null {
  const candidate = text(value);
  return candidate && CLICK_ID_PATTERN.test(candidate) ? candidate : null;
}

export function couponCode(value: unknown): string | null {
  const candidate = text(value)?.toUpperCase();
  return candidate && COUPON_PATTERN.test(candidate) ? candidate : null;
}

export function clickIdFromUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  try {
    return clickId(new URL(url).searchParams.get("tscid"));
  } catch {
    return null;
  }
}

/** Checks the common metadata keys used by each provider before giving up. */
export function clickIdFromMetadata(record: JsonRecord | null): string | null {
  if (!record) return null;
  for (const key of ["tscid", "ts_click_id", "click_id", "client_reference_id"]) {
    const found = clickId(record[key]);
    if (found) return found;
  }
  return clickId(record.ref);
}

export function couponFromMetadata(record: JsonRecord | null): string | null {
  if (!record) return null;
  for (const key of ["ts_coupon_code", "coupon_code", "coupon"]) {
    const found = couponCode(record[key]);
    if (found) return found;
  }
  return null;
}

export function eventId(headerValue: string | null, rawBody: string): string {
  const trimmed = headerValue?.trim();
  if (trimmed) return trimmed;
  return `body_${createHash("sha256").update(rawBody, "utf8").digest("hex").slice(0, 40)}`;
}

export function optionalString(value: unknown): string | null {
  const result = text(value);
  return result || null;
}
