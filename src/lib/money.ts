/** Money is integer minor units. Never use floats for stored or authoritative amounts. */

export const CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is CurrencyCode {
  return (CURRENCIES as readonly string[]).includes(value);
}

const ZERO_DECIMAL = new Set(["JPY", "KRW"]);

export function minorUnitExponent(currency: string): number {
  return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

export function formatMoney(minor: number, currency: string, locale = "en-IE"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 10 ** minorUnitExponent(currency));
}

/** Parses "12.50" into 1250. Rejects malformed input rather than guessing. */
export function parseMoneyToMinor(input: string, currency: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const exponent = minorUnitExponent(currency);
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > exponent) return null;
  return Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, "0") || "0");
}

const BPS_DENOMINATOR = 10_000n;

/** Banker's rounding to the nearest minor unit, exact for large amounts. */
export function percentOf(amountMinor: number, bps: number): number {
  const value = BigInt(amountMinor) * BigInt(bps);
  const quotient = value / BPS_DENOMINATOR;
  const remainder = value % BPS_DENOMINATOR;
  const half = BPS_DENOMINATOR / 2n;
  if (remainder > half || (remainder === half && quotient % 2n === 1n)) return Number(quotient + 1n);
  return Number(quotient);
}

export interface CommissionRule {
  rateType: "percent" | "fixed";
  commissionBps: number;
  commissionFixedMinor: number | null;
}

export function commissionAmount(saleMinor: number, rule: CommissionRule): number {
  if (saleMinor <= 0) return 0;
  const amount = rule.rateType === "percent" ? percentOf(saleMinor, rule.commissionBps) : (rule.commissionFixedMinor ?? 0);
  return Math.min(amount, saleMinor);
}

const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
