import { z } from "zod";

export const refundRequestSchema = z
  .object({
    commissionId: z.string().trim().regex(/^com_[A-Za-z0-9_-]{6,80}$/, "commissionId is not a valid commission ID."),
    refundId: z.string().trim().min(1).max(200),
    amountMinor: z.number().int().positive().max(2_000_000_000),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "currency must be a three-letter ISO code.")
      .transform((value) => value.toUpperCase()),
    kind: z.enum(["refund", "chargeback"]).optional().default("refund"),
    occurredAt: z.coerce.date().optional(),
  })
  .strict();

export type RefundRequestInput = z.infer<typeof refundRequestSchema>;
