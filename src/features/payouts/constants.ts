export const PAYOUT_METHODS = ["paypal", "bank_transfer", "wise", "other"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  paypal: "PayPal",
  bank_transfer: "Bank transfer",
  wise: "Wise",
  other: "Other",
};

export const PAYOUT_STATUS_LABELS = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
} as const;

export function isPayoutMethod(value: string | null | undefined): value is PayoutMethod {
  return value !== null && value !== undefined && (PAYOUT_METHODS as readonly string[]).includes(value);
}
