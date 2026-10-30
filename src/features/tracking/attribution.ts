export type TrackingMode = "live" | "test";

export type AttributionOutcome =
  | "attributed"
  | "no_click"
  | "unknown_click"
  | "expired_click"
  | "wrong_mode"
  | "affiliate_inactive"
  | "currency_mismatch"
  | "coupon_conflict";

export type AttributedVia = "click" | "coupon" | "none";

export interface ClickSnapshot {
  id: string;
  affiliateId: string | null;
  mode: TrackingMode;
  occurredAt: Date;
  affiliateStatus: "pending" | "approved" | "rejected" | "suspended" | null;
}

export interface CouponSnapshot {
  code: string;
  affiliateId: string;
  status: "active" | "inactive";
  affiliateStatus: "pending" | "approved" | "rejected" | "suspended" | null;
}

export interface AttributionInput {
  mode: TrackingMode;
  /** undefined: no click ID supplied. null: a click ID was supplied but no row matched. */
  click: ClickSnapshot | null | undefined;
  coupon: CouponSnapshot | null | undefined;
  currency: string;
  programCurrency: string;
  conflict: "click" | "coupon";
  conversionAt: Date;
  attributionDays: number;
}

export interface AttributionDecision {
  outcome: AttributionOutcome;
  affiliateId: string | null;
  via: AttributedVia;
  clickId: string | null;
  couponCode: string | null;
}

const DAY_MS = 86_400_000;

function invalidClickOutcome(click: ClickSnapshot | null | undefined, mode: TrackingMode, conversionAt: Date, attributionDays: number): AttributionOutcome | null {
  if (click === undefined) return null;
  if (click === null) return "unknown_click";
  if (click.mode !== mode) return "wrong_mode";
  if (conversionAt.getTime() - click.occurredAt.getTime() > attributionDays * DAY_MS) return "expired_click";
  if (click.affiliateId === null || click.affiliateStatus !== "approved") return "affiliate_inactive";
  return null;
}

/**
 * Pure attribution decision. The conversion is always stored; `outcome` explains why it
 * did or did not credit an affiliate. Click validity is checked before coupon fallback.
 */
export function decideAttribution(input: AttributionInput): AttributionDecision {
  const clickId = input.click?.id ?? null;
  const couponCode = input.coupon?.code ?? null;

  if (input.currency.toUpperCase() !== input.programCurrency.toUpperCase()) {
    return { outcome: "currency_mismatch", affiliateId: null, via: "none", clickId, couponCode };
  }

  const clickProblem = invalidClickOutcome(input.click, input.mode, input.conversionAt, input.attributionDays);
  const validClick = input.click && !clickProblem ? input.click : null;

  const validCoupon =
    input.coupon && input.coupon.status === "active" && input.coupon.affiliateStatus === "approved" ? input.coupon : null;

  if (validClick && validCoupon) {
    if (input.conflict === "coupon") {
      return {
        outcome: "attributed",
        affiliateId: validCoupon.affiliateId,
        via: "coupon",
        clickId,
        couponCode: validCoupon.code,
      };
    }
    return {
      outcome: "attributed",
      affiliateId: validClick.affiliateId,
      via: "click",
      clickId,
      couponCode,
    };
  }

  if (validClick) {
    return { outcome: "attributed", affiliateId: validClick.affiliateId, via: "click", clickId, couponCode };
  }

  if (validCoupon) {
    return { outcome: "attributed", affiliateId: validCoupon.affiliateId, via: "coupon", clickId, couponCode: validCoupon.code };
  }

  return {
    outcome: clickProblem ?? "no_click",
    affiliateId: null,
    via: "none",
    clickId,
    couponCode,
  };
}

export const OUTCOME_LABELS: Record<AttributionOutcome, string> = {
  attributed: "Credited to an affiliate",
  no_click: "No click or coupon on the conversion",
  unknown_click: "Click ID not recognised",
  expired_click: "Click outside the attribution window",
  wrong_mode: "Click belongs to the other mode",
  affiliate_inactive: "Affiliate was not active",
  currency_mismatch: "Currency does not match the program",
  coupon_conflict: "Conflicting attribution signals",
};
