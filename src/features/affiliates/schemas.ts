import { z } from "zod";
import { CHANNELS, MAX_PROMOTION_PLAN_LENGTH } from "./constants";

const channelValues = z.enum(CHANNELS);
const optionalUrl = z.union([z.literal(""), z.url("Enter a full URL, including https://")]).optional();

const channels = z
  .array(channelValues)
  .min(1, "Choose at least one channel.")
  .max(CHANNELS.length);

export const applicationSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(120),
  websiteUrl: z.url("Enter a full URL, including https://"),
  channels: z.preprocess((value) => (Array.isArray(value) ? value : value ? [value] : []), channels),
  promotionPlan: z
    .string()
    .trim()
    .min(20, "Tell us how you will promote the product (at least 20 characters).")
    .max(MAX_PROMOTION_PLAN_LENGTH),
  audience: z.string().trim().max(500).default(""),
  termsAccepted: z.literal("on", "Accept the program terms to apply."),
});

export const decisionSchema = z.object({
  reason: z.string().trim().min(3, "Give a short reason.").max(500),
});

export const manualAffiliateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(120),
  email: z.email("Enter a valid email address."),
  websiteUrl: optionalUrl,
  notes: z.string().trim().max(2000).default(""),
});

export const affiliateProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter a display name.").max(120),
  websiteUrl: optionalUrl,
  country: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).default(""),
});

export const overrideSchema = z.object({
  overridePercent: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^\d+(\.\d{1,2})?$/.test(value), "Enter a percentage like 25 or 25.5.")
    .refine((value) => !value || Number(value) <= 100, "Use 100 or less."),
});

export const suspensionSchema = z.object({
  reason: z.string().trim().min(3, "Give a short reason.").max(500),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;
export type ManualAffiliateInput = z.infer<typeof manualAffiliateSchema>;
export type AffiliateProfileInput = z.infer<typeof affiliateProfileSchema>;
