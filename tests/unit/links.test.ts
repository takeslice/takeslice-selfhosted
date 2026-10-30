import { describe, expect, it } from "vitest";
import { destinationProblem, isAllowedSiteOrigin } from "@/features/links/server/destination";
import { clickRequestSchema, conversionSchema } from "@/features/tracking/schemas";

describe("destinationProblem", () => {
  const site = "https://acme.example";

  it("allows the program site and its subdomains", () => {
    expect(destinationProblem("https://acme.example/pricing", site)).toBeNull();
    expect(destinationProblem("https://www.acme.example/pricing", site)).toBeNull();
    expect(destinationProblem("https://app.acme.example/signup", site)).toBeNull();
  });

  it("rejects lookalike and unrelated hosts", () => {
    expect(destinationProblem("https://evilacme.example", site)).toMatch(/must be on/);
    expect(destinationProblem("https://acme.example.evil.test", site)).toMatch(/must be on/);
  });

  it("rejects non-https destinations except on localhost", () => {
    expect(destinationProblem("http://acme.example/pricing", site)).toMatch(/https/);
    expect(destinationProblem("http://localhost:3000/pricing", "http://localhost:3000")).toBeNull();
  });

  it("rejects credentials and non-http protocols", () => {
    expect(destinationProblem("https://user:pass@acme.example", site)).toMatch(/username/);
    expect(destinationProblem("javascript:alert(1)", site)).toMatch(/http/);
  });
});

describe("isAllowedSiteOrigin", () => {
  it("allows the site and subdomains only", () => {
    expect(isAllowedSiteOrigin("https://acme.example", "https://acme.example")).toBe(true);
    expect(isAllowedSiteOrigin("https://store.acme.example", "https://acme.example")).toBe(true);
    expect(isAllowedSiteOrigin("https://attacker.example", "https://acme.example")).toBe(false);
    expect(isAllowedSiteOrigin("https://acme.example.attacker.test", "https://acme.example")).toBe(false);
  });
});

describe("conversionSchema", () => {
  it("accepts a minimal conversion and normalises currency", () => {
    const parsed = conversionSchema.parse({ externalId: "order_1", amountMinor: 4900, currency: "eur" });
    expect(parsed.currency).toBe("EUR");
    expect(parsed.event).toBe("purchase");
  });

  it("rejects a fractional amount and unknown fields", () => {
    expect(conversionSchema.safeParse({ externalId: "order_1", amountMinor: 12.5 }).success).toBe(false);
    expect(conversionSchema.safeParse({ externalId: "order_1", amountMinor: 100, commission: 500 }).success).toBe(false);
  });

  it("normalises coupon codes and validates click IDs", () => {
    const parsed = conversionSchema.parse({ externalId: "order_1", amountMinor: 100, couponCode: "pat20" });
    expect(parsed.couponCode).toBe("PAT20");
    expect(conversionSchema.safeParse({ externalId: "order_1", amountMinor: 100, clickId: "not-a-click" }).success).toBe(false);
  });
});

describe("clickRequestSchema", () => {
  it("accepts a landing URL and defaults to live", () => {
    const parsed = clickRequestSchema.parse({ ref: "pat12345", landingUrl: "https://acme.example/" });
    expect(parsed.mode).toBe("live");
  });

  it("rejects invalid referral codes", () => {
    expect(clickRequestSchema.safeParse({ ref: "../admin" }).success).toBe(false);
  });
});
