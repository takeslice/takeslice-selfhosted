import { z } from "zod";

export const conversionSchema = z
  .object({
    externalId: z.string().trim().min(1, "externalId is required.").max(200),
    amountMinor: z.number().int("amountMinor must be an integer in minor units.").min(0).max(2_000_000_000),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "currency must be a three-letter ISO code.")
      .transform((value) => value.toUpperCase())
      .optional(),
    event: z.string().trim().min(1).max(40).optional().default("purchase"),
    clickId: z
      .string()
      .trim()
      .regex(/^clk_[A-Za-z0-9_-]{6,80}$/, "clickId is not a valid TakeSlice click ID.")
      .optional(),
    couponCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{3,64}$/, "couponCode is not valid.")
      .transform((value) => value.toUpperCase())
      .optional(),
    subscriptionRef: z.string().trim().min(1).max(200).optional(),
    /** Provider payment or charge ID so a later refund can be matched. */
    paymentReference: z.string().trim().min(1).max(200).optional(),
    renewal: z.boolean().optional().default(false),
    occurredAt: z.coerce.date().optional(),
  })
  .strict();

export type ConversionInput = z.infer<typeof conversionSchema>;

export const clickRequestSchema = z
  .object({
    ref: z.string().trim().regex(/^[a-z0-9]{4,32}$/, "ref is not a valid referral code."),
    landingUrl: z.url().max(2048).optional(),
    referrer: z.string().max(2048).optional(),
    mode: z.enum(["live", "test"]).optional().default("live"),
  })
  .strict();

export type ClickRequestInput = z.infer<typeof clickRequestSchema>;
