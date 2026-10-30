import { z } from "zod";
import { CURRENCIES } from "@/lib/money";

const slug = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters.")
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");

const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address.")]).optional();

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 50 or 50.00.");

export const programSettingsSchema = z
  .object({
    businessName: z.string().trim().min(2, "Enter your business name.").max(120),
    websiteUrl: z.url("Enter a full URL, including https://"),
    programName: z.string().trim().min(2, "Enter a program name.").max(120),
    programSlug: slug,
    description: z.string().trim().max(2000).default(""),
    terms: z.string().trim().max(20_000).default(""),
    supportEmail: optionalEmail,
    currency: z.enum(CURRENCIES),
    rateType: z.enum(["percent", "fixed"]),
    commissionPercent: z.coerce.number().min(0, "Use 0 to 100.").max(100, "Use 0 to 100.").default(20),
    commissionFixed: z.string().trim().optional(),
    attributionDays: z.coerce.number().int().min(1).max(365),
    validationDays: z.coerce.number().int().min(0).max(67),
    holdingDays: z.coerce.number().int().min(0).max(365),
    recurringMode: z.enum(["first_payment", "months", "lifetime"]).default("first_payment"),
    recurringMonths: z.coerce.number().int().min(1).max(60).optional(),
    approvalMode: z.enum(["manual", "auto"]).default("manual"),
    couponMode: z.enum(["disabled", "manual", "auto"]).default("manual"),
    attributionConflict: z.enum(["click", "coupon"]).default("click"),
    minimumPayout: money,
  })
  .superRefine((value, context) => {
    if (value.rateType === "fixed" && !money.safeParse(value.commissionFixed ?? "").success) {
      context.addIssue({ code: "custom", path: ["commissionFixed"], message: "Enter the fixed commission." });
    }
    if (value.recurringMode === "months" && !value.recurringMonths) {
      context.addIssue({ code: "custom", path: ["recurringMonths"], message: "Enter the number of months." });
    }
  });

export const brandingSchema = z.object({
  brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3187ee."),
  hideBranding: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
});

export type ProgramSettingsInput = z.infer<typeof programSettingsSchema>;
export type BrandingInput = z.infer<typeof brandingSchema>;
