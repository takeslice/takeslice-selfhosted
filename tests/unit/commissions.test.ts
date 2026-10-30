import { describe, expect, it } from "vitest";
import { amountForRate, renewalQualifies, resolveRate } from "@/features/commissions/rules";

const percentRules = {
  currency: "EUR",
  rateType: "percent" as const,
  commissionBps: 2000,
  commissionFixedMinor: null,
  recurringMode: "first_payment" as const,
  recurringMonths: null,
};

const fixedRules = {
  currency: "EUR",
  rateType: "fixed" as const,
  commissionBps: 0,
  commissionFixedMinor: 1000,
  recurringMode: "first_payment" as const,
  recurringMonths: null,
};

describe("commission rate resolution", () => {
  it("uses the program percentage when no override exists", () => {
    expect(resolveRate(percentRules, null)).toEqual({ type: "percent", bps: 2000, fixedMinor: null, source: "program" });
  });

  it("uses an affiliate percentage override", () => {
    expect(resolveRate(percentRules, 3500)).toEqual({ type: "percent", bps: 3500, fixedMinor: null, source: "override" });
  });

  it("ignores an affiliate override on a fixed-rate program", () => {
    expect(resolveRate(fixedRules, 3500)).toEqual({ type: "fixed", bps: null, fixedMinor: 1000, source: "program" });
  });
});

describe("commission amount", () => {
  it("applies a percentage with banker's rounding", () => {
    expect(amountForRate(4999, { type: "percent", bps: 2000, fixedMinor: null, source: "program" })).toBe(1000);
  });

  it("applies a fixed amount", () => {
    expect(amountForRate(4999, { type: "fixed", bps: null, fixedMinor: 1000, source: "program" })).toBe(1000);
  });

  it("never pays more commission than the sale", () => {
    expect(amountForRate(500, { type: "fixed", bps: null, fixedMinor: 1000, source: "program" })).toBe(500);
  });

  it("pays nothing for a zero or negative sale", () => {
    expect(amountForRate(0, { type: "percent", bps: 2000, fixedMinor: null, source: "program" })).toBe(0);
    expect(amountForRate(-100, { type: "percent", bps: 2000, fixedMinor: null, source: "program" })).toBe(0);
  });
});

describe("renewal eligibility", () => {
  it("never credits renewals in first-payment mode", () => {
    expect(renewalQualifies(percentRules, 0)).toBe(false);
  });

  it("credits a bounded number of renewals in months mode", () => {
    const rules = { ...percentRules, recurringMode: "months" as const, recurringMonths: 3 };
    expect(renewalQualifies(rules, 0)).toBe(true);
    expect(renewalQualifies(rules, 2)).toBe(true);
    expect(renewalQualifies(rules, 3)).toBe(false);
  });

  it("credits every renewal in lifetime mode", () => {
    const rules = { ...percentRules, recurringMode: "lifetime" as const };
    expect(renewalQualifies(rules, 0)).toBe(true);
    expect(renewalQualifies(rules, 500)).toBe(true);
  });
});
