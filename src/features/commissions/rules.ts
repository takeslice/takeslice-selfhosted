import type { programSettings } from "@/lib/db/schema";
import { commissionAmount } from "@/lib/money";

type ProgramRules = Pick<
  typeof programSettings.$inferSelect,
  "currency" | "rateType" | "commissionBps" | "commissionFixedMinor" | "recurringMode" | "recurringMonths"
>;

export interface RateSnapshot {
  type: "percent" | "fixed";
  bps: number | null;
  fixedMinor: number | null;
  source: "program" | "override";
}

/** Affiliate overrides are percentages and only apply to percentage programs. */
export function resolveRate(rules: ProgramRules, overrideBps: number | null): RateSnapshot {
  if (rules.rateType === "percent") {
    const useOverride = overrideBps !== null && overrideBps !== undefined;
    return {
      type: "percent",
      bps: useOverride ? overrideBps : rules.commissionBps,
      fixedMinor: null,
      source: useOverride ? "override" : "program",
    };
  }
  return { type: "fixed", bps: null, fixedMinor: rules.commissionFixedMinor, source: "program" };
}

export function amountForRate(saleMinor: number, rate: RateSnapshot): number {
  return commissionAmount(saleMinor, {
    rateType: rate.type,
    commissionBps: rate.bps ?? 0,
    commissionFixedMinor: rate.fixedMinor,
  });
}

/**
 * `priorRenewals` counts earlier renewal conversions on the same subscription.
 * The first payment always qualifies; only renewals are limited by the mode.
 */
export function renewalQualifies(rules: ProgramRules, priorRenewals: number): boolean {
  if (rules.recurringMode === "first_payment") return false;
  if (rules.recurringMode === "lifetime") return true;
  return priorRenewals < (rules.recurringMonths ?? 12);
}
