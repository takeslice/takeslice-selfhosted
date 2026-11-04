import { describe, expect, it } from "vitest";
import { isSelfReferralEmail } from "@/features/tracking/self-referral";
import { stripeAdapter } from "@/features/providers/adapters/stripe";

describe("isSelfReferralEmail", () => {
  it("matches the affiliate account email regardless of case and whitespace", () => {
    expect(isSelfReferralEmail("  Jane@Example.com ", ["jane@example.com", null])).toBe(true);
  });

  it("matches the affiliate contact email", () => {
    expect(isSelfReferralEmail("pay@jane.dev", ["jane@example.com", "PAY@jane.dev"])).toBe(true);
  });

  it("does not match a different buyer", () => {
    expect(isSelfReferralEmail("buyer@example.com", ["jane@example.com", null])).toBe(false);
  });

  it("never matches when the buyer email is missing", () => {
    expect(isSelfReferralEmail(null, [null, undefined])).toBe(false);
    expect(isSelfReferralEmail("", ["", null])).toBe(false);
  });
});

describe("Stripe adapter buyer email", () => {
  it("reads the checkout customer email for the self-referral check", () => {
    const raw = JSON.stringify({
      id: "evt_email_1",
      type: "checkout.session.completed",
      created: 1_793_395_200,
      data: {
        object: {
          id: "cs_email_1",
          payment_status: "paid",
          amount_total: 1000,
          currency: "usd",
          customer_details: { email: "buyer@example.com" },
          metadata: {},
        },
      },
    });
    expect(stripeAdapter.parse(raw, new Headers())).toMatchObject({ kind: "conversion", customerEmail: "buyer@example.com" });
  });
});
