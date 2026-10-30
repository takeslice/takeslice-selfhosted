import { describe, expect, it } from "vitest";
import { brandingSchema, programSettingsSchema } from "@/features/program/schemas";
import { emailSettingsSchema } from "@/features/email/schemas";
import { questionSchema } from "@/features/questions/schemas";

const program = {
  businessName: "Acme Labs",
  websiteUrl: "https://acme.example",
  programName: "Acme Partners",
  programSlug: "acme",
  currency: "EUR",
  rateType: "percent",
  commissionPercent: "20",
  attributionDays: "30",
  validationDays: "30",
  holdingDays: "0",
  minimumPayout: "50",
};

describe("programSettingsSchema", () => {
  it("accepts a percent program and coerces numbers", () => {
    const parsed = programSettingsSchema.parse(program);
    expect(parsed.commissionPercent).toBe(20);
    expect(parsed.attributionDays).toBe(30);
  });

  it("requires a fixed commission when the rate type is fixed", () => {
    expect(programSettingsSchema.safeParse({ ...program, rateType: "fixed", commissionFixed: "" }).success).toBe(false);
    expect(programSettingsSchema.safeParse({ ...program, rateType: "fixed", commissionFixed: "10.00" }).success).toBe(true);
  });

  it("rejects invalid slugs, currencies and day counts", () => {
    expect(programSettingsSchema.safeParse({ ...program, programSlug: "Acme Partners" }).success).toBe(false);
    expect(programSettingsSchema.safeParse({ ...program, currency: "JPY" }).success).toBe(false);
    expect(programSettingsSchema.safeParse({ ...program, validationDays: "68" }).success).toBe(false);
  });

  it("requires renewal months for limited recurring commissions", () => {
    expect(programSettingsSchema.safeParse({ ...program, recurringMode: "months" }).success).toBe(false);
    expect(programSettingsSchema.safeParse({ ...program, recurringMode: "months", recurringMonths: "12" }).success).toBe(true);
  });
});

describe("brandingSchema", () => {
  it("accepts a six-digit hex colour and normalises the checkbox", () => {
    const parsed = brandingSchema.parse({ brandColor: "#3187ee", hideBranding: "on" });
    expect(parsed.hideBranding).toBe(true);
    expect(brandingSchema.parse({ brandColor: "#3187ee" }).hideBranding).toBe(false);
  });

  it("rejects non-hex colours", () => {
    expect(brandingSchema.safeParse({ brandColor: "blue" }).success).toBe(false);
  });
});

describe("emailSettingsSchema", () => {
  it("accepts empty host and optional credentials", () => {
    expect(emailSettingsSchema.safeParse({ port: "465", secure: "true", fromName: "TakeSlice", fromEmail: "a@b.co" }).success).toBe(true);
  });

  it("requires a valid sender address", () => {
    expect(emailSettingsSchema.safeParse({ port: "465", secure: "true", fromName: "TakeSlice", fromEmail: "nope" }).success).toBe(false);
  });
});

describe("questionSchema", () => {
  it("splits select options by line and drops blank lines", () => {
    const parsed = questionSchema.parse({ label: "Where?", type: "select", required: "on", options: "YouTube\n\nNewsletter " });
    expect(parsed.options).toEqual(["YouTube", "Newsletter"]);
    expect(parsed.required).toBe(true);
  });

  it("requires at least two options for select questions", () => {
    expect(questionSchema.safeParse({ label: "Where?", type: "select", options: "YouTube" }).success).toBe(false);
  });
});
