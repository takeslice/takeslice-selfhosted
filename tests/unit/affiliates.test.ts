import { describe, expect, it } from "vitest";
import { canTransitionAffiliate } from "@/features/affiliates/rules";
import { AFFILIATE_STATUSES } from "@/features/affiliates/constants";
import { applicationSchema, manualAffiliateSchema, overrideSchema } from "@/features/affiliates/schemas";

describe("canTransitionAffiliate", () => {
  it("allows pending to be approved or rejected", () => {
    expect(canTransitionAffiliate("pending", "approved")).toBe(true);
    expect(canTransitionAffiliate("pending", "rejected")).toBe(true);
  });

  it("allows approved to be suspended and suspended to be reactivated", () => {
    expect(canTransitionAffiliate("approved", "suspended")).toBe(true);
    expect(canTransitionAffiliate("suspended", "approved")).toBe(true);
  });

  it("allows a rejected applicant to apply again", () => {
    expect(canTransitionAffiliate("rejected", "pending")).toBe(true);
  });

  it("rejects invalid or repeat transitions", () => {
    expect(canTransitionAffiliate("approved", "pending")).toBe(false);
    expect(canTransitionAffiliate("approved", "approved")).toBe(false);
    expect(canTransitionAffiliate("suspended", "rejected")).toBe(false);
    expect(canTransitionAffiliate("pending", "suspended")).toBe(false);
  });

  it("only ever returns a known status", () => {
    for (const from of AFFILIATE_STATUSES) {
      for (const to of AFFILIATE_STATUSES) {
        expect(typeof canTransitionAffiliate(from, to)).toBe("boolean");
      }
    }
  });
});

const validApplication = {
  displayName: "Ada Creator",
  websiteUrl: "https://ada.example",
  channels: ["YouTube", "Newsletter"],
  promotionPlan: "I publish weekly tutorials and a newsletter with 12,000 readers.",
  audience: "Developers learning web development",
  termsAccepted: "on",
};

describe("applicationSchema", () => {
  it("accepts a complete application", () => {
    expect(applicationSchema.safeParse(validApplication).success).toBe(true);
  });

  it("normalises a single channel value from a form field", () => {
    const parsed = applicationSchema.parse({ ...validApplication, channels: "YouTube" });
    expect(parsed.channels).toEqual(["YouTube"]);
  });

  it("requires at least one channel and a real promotion plan", () => {
    expect(applicationSchema.safeParse({ ...validApplication, channels: [] }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validApplication, promotionPlan: "Short" }).success).toBe(false);
  });

  it("requires accepting the terms", () => {
    expect(applicationSchema.safeParse({ ...validApplication, termsAccepted: "" }).success).toBe(false);
  });

  it("rejects channels outside the published list", () => {
    expect(applicationSchema.safeParse({ ...validApplication, channels: ["Billboard"] }).success).toBe(false);
  });

  it("requires a full website URL", () => {
    expect(applicationSchema.safeParse({ ...validApplication, websiteUrl: "ada.example" }).success).toBe(false);
  });
});

describe("manualAffiliateSchema", () => {
  it("allows an empty website but requires name and email", () => {
    expect(manualAffiliateSchema.safeParse({ name: "Ada", email: "ada@example.com" }).success).toBe(true);
    expect(manualAffiliateSchema.safeParse({ name: "Ada", email: "not-an-email" }).success).toBe(false);
    expect(manualAffiliateSchema.safeParse({ name: "Ada", email: "ada@example.com", websiteUrl: "ada.example" }).success).toBe(false);
  });
});

describe("overrideSchema", () => {
  it("accepts empty, integer and decimal percentages", () => {
    expect(overrideSchema.safeParse({ overridePercent: "" }).success).toBe(true);
    expect(overrideSchema.safeParse({ overridePercent: "25" }).success).toBe(true);
    expect(overrideSchema.safeParse({ overridePercent: "12.5" }).success).toBe(true);
  });

  it("rejects more than 100 percent or malformed values", () => {
    expect(overrideSchema.safeParse({ overridePercent: "101" }).success).toBe(false);
    expect(overrideSchema.safeParse({ overridePercent: "12.345" }).success).toBe(false);
    expect(overrideSchema.safeParse({ overridePercent: "abc" }).success).toBe(false);
  });
});
