import { describe, expect, it } from "vitest";
import { decideAttribution, type AttributionInput } from "@/features/tracking/attribution";

const now = new Date("2026-10-30T12:00:00Z");
const clickAt = new Date("2026-10-29T12:00:00Z");

function input(overrides: Partial<AttributionInput> = {}): AttributionInput {
  return {
    mode: "live",
    click: {
      id: "clk_test",
      affiliateId: "aff_1",
      mode: "live",
      occurredAt: clickAt,
      affiliateStatus: "approved",
    },
    coupon: undefined,
    currency: "EUR",
    programCurrency: "EUR",
    conflict: "click",
    conversionAt: now,
    attributionDays: 30,
    ...overrides,
  };
}

describe("decideAttribution", () => {
  it("credits a valid click", () => {
    expect(decideAttribution(input())).toEqual({
      outcome: "attributed",
      affiliateId: "aff_1",
      via: "click",
      clickId: "clk_test",
      couponCode: null,
    });
  });

  it("stores an unknown click ID as unknown_click", () => {
    expect(decideAttribution(input({ click: null })).outcome).toBe("unknown_click");
  });

  it("rejects a click older than the attribution window", () => {
    const click = { id: "clk_old", affiliateId: "aff_1", mode: "live" as const, occurredAt: new Date("2026-08-01T12:00:00Z"), affiliateStatus: "approved" as const };
    expect(decideAttribution(input({ click })).outcome).toBe("expired_click");
  });

  it("keeps a click exactly on the window edge", () => {
    const click = { id: "clk_edge", affiliateId: "aff_1", mode: "live" as const, occurredAt: new Date("2026-09-30T12:00:00Z"), affiliateStatus: "approved" as const };
    expect(decideAttribution(input({ click })).outcome).toBe("attributed");
  });

  it("rejects a click from the other mode", () => {
    const click = { id: "clk_test", affiliateId: "aff_1", mode: "test" as const, occurredAt: clickAt, affiliateStatus: "approved" as const };
    expect(decideAttribution(input({ click })).outcome).toBe("wrong_mode");
  });

  it("rejects a click owned by an affiliate that is no longer approved", () => {
    const click = { id: "clk_test", affiliateId: "aff_1", mode: "live" as const, occurredAt: clickAt, affiliateStatus: "suspended" as const };
    expect(decideAttribution(input({ click })).outcome).toBe("affiliate_inactive");
  });

  it("rejects a currency that differs from the program", () => {
    const decision = decideAttribution(input({ currency: "USD" }));
    expect(decision.outcome).toBe("currency_mismatch");
    expect(decision.affiliateId).toBeNull();
  });

  it("falls back to a coupon when there is no click", () => {
    const decision = decideAttribution(
      input({
        click: undefined,
        coupon: { code: "PAT20", affiliateId: "aff_2", status: "active", affiliateStatus: "approved" },
      }),
    );
    expect(decision).toMatchObject({ outcome: "attributed", affiliateId: "aff_2", via: "coupon", couponCode: "PAT20" });
  });

  it("falls back to a coupon when the click has expired", () => {
    const decision = decideAttribution(
      input({
        click: { id: "clk_old", affiliateId: "aff_1", mode: "live", occurredAt: new Date("2026-01-01T00:00:00Z"), affiliateStatus: "approved" },
        coupon: { code: "PAT20", affiliateId: "aff_2", status: "active", affiliateStatus: "approved" },
      }),
    );
    expect(decision).toMatchObject({ outcome: "attributed", affiliateId: "aff_2", via: "coupon" });
  });

  it("uses the configured conflict rule when both are valid", () => {
    const coupon = { code: "PAT20", affiliateId: "aff_2", status: "active" as const, affiliateStatus: "approved" as const };
    expect(decideAttribution(input({ coupon, conflict: "click" })).affiliateId).toBe("aff_1");
    expect(decideAttribution(input({ coupon, conflict: "coupon" })).affiliateId).toBe("aff_2");
  });

  it("ignores inactive coupons and inactive coupon owners", () => {
    const inactive = decideAttribution(input({ click: undefined, coupon: { code: "PAT20", affiliateId: "aff_2", status: "inactive", affiliateStatus: "approved" } }));
    expect(inactive.outcome).toBe("no_click");
    const suspended = decideAttribution(input({ click: undefined, coupon: { code: "PAT20", affiliateId: "aff_2", status: "active", affiliateStatus: "suspended" } }));
    expect(suspended.outcome).toBe("no_click");
  });

  it("records no_click when neither signal exists", () => {
    expect(decideAttribution(input({ click: undefined })).outcome).toBe("no_click");
  });
});
