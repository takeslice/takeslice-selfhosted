import { z } from "zod";

export const couponSchema = z.object({
  affiliateId: z.string().trim().min(1, "Choose an affiliate."),
  code: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters.")
    .max(64, "Use 64 characters or fewer.")
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, dashes or underscores.")
    .transform((value) => value.toUpperCase()),
  discountText: z.string().trim().max(80).optional().default(""),
});

export type CouponInput = z.infer<typeof couponSchema>;
