import { and, eq } from "drizzle-orm";
import { affiliate, subscriptionLink } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import type { AttributionDecision } from "../attribution";

/**
 * A renewal may arrive without the original click or coupon. Credit the affiliate who
 * first earned the subscription, but never override a real conflict or currency mismatch.
 */
export async function applySubscriptionFallback(
  decision: AttributionDecision,
  input: { mode: "live" | "test"; renewal: boolean; subscriptionRef: string | null },
): Promise<AttributionDecision> {
  if (decision.affiliateId || !input.renewal || !input.subscriptionRef) return decision;
  if (decision.outcome === "currency_mismatch" || decision.outcome === "wrong_mode") return decision;

  const [link] = await db
    .select({ affiliateId: subscriptionLink.affiliateId, status: affiliate.status })
    .from(subscriptionLink)
    .innerJoin(affiliate, eq(subscriptionLink.affiliateId, affiliate.id))
    .where(and(eq(subscriptionLink.subscriptionRef, input.subscriptionRef), eq(subscriptionLink.mode, input.mode)))
    .limit(1);
  if (!link?.affiliateId || link.status !== "approved") return decision;

  return { ...decision, outcome: "attributed", affiliateId: link.affiliateId, via: "subscription" };
}
