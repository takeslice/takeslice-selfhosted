import { describe, expect, it } from "vitest";
import { addDays, commissionAmount, formatMoney, parseMoneyToMinor, percentOf } from "@/lib/money";

describe("parseMoneyToMinor", () => {
  it("parses whole and fractional amounts", () => {
    expect(parseMoneyToMinor("12", "EUR")).toBe(1200);
    expect(parseMoneyToMinor("12.5", "EUR")).toBe(1250);
    expect(parseMoneyToMinor("12.50", "EUR")).toBe(1250);
    expect(parseMoneyToMinor(" 1 234.00 ", "EUR")).toBe(123400);
  });

  it("rejects malformed amounts instead of guessing", () => {
    expect(parseMoneyToMinor("", "EUR")).toBeNull();
    expect(parseMoneyToMinor("12.345", "EUR")).toBeNull();
    expect(parseMoneyToMinor("-5", "EUR")).toBeNull();
    expect(parseMoneyToMinor("1,50", "EUR")).toBeNull();
    expect(parseMoneyToMinor("abc", "EUR")).toBeNull();
  });

  it("rejects any fraction for zero-decimal currencies", () => {
    expect(parseMoneyToMinor("1000", "JPY")).toBe(1000);
    expect(parseMoneyToMinor("1000.5", "JPY")).toBeNull();
  });
});

describe("percentOf", () => {
  it("uses banker's rounding at exact halves", () => {
    expect(percentOf(125, 1000)).toBe(12); // 12.5 -> 12, because 12 is even
    expect(percentOf(250, 100)).toBe(2); // 2.5 -> 2, because 2 is even
    expect(percentOf(150, 100)).toBe(2); // 1.5 -> 2, because 1 is odd
  });

  it("rounds to the nearest minor unit", () => {
    expect(percentOf(1999, 2000)).toBe(400);
    expect(percentOf(0, 2000)).toBe(0);
    expect(percentOf(1000, 0)).toBe(0);
  });
});

describe("commissionAmount", () => {
  it("computes percent and fixed commissions", () => {
    expect(commissionAmount(10000, { rateType: "percent", commissionBps: 2000, commissionFixedMinor: null })).toBe(2000);
    expect(commissionAmount(10000, { rateType: "fixed", commissionBps: 2000, commissionFixedMinor: 1500 })).toBe(1500);
  });

  it("never pays more than the sale", () => {
    expect(commissionAmount(500, { rateType: "fixed", commissionBps: 0, commissionFixedMinor: 1500 })).toBe(500);
  });

  it("pays nothing for a non-positive sale", () => {
    expect(commissionAmount(0, { rateType: "percent", commissionBps: 2000, commissionFixedMinor: null })).toBe(0);
    expect(commissionAmount(-100, { rateType: "percent", commissionBps: 2000, commissionFixedMinor: null })).toBe(0);
  });
});

describe("formatting and dates", () => {
  it("formats minor units with the currency", () => {
    expect(formatMoney(1250, "EUR", "en-IE")).toContain("12.50");
    expect(formatMoney(500, "JPY", "en-IE")).toContain("500");
  });

  it("adds exact days", () => {
    expect(addDays(new Date("2026-01-01T00:00:00.000Z"), 30).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});
