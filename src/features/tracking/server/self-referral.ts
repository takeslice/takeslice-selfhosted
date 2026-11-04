import { eq } from "drizzle-orm";
import { affiliate, user } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import type { AttributionDecision } from "../attribution";
import { isSelfReferralEmail, normaliseEmail } from "../self-referral";

/**
 * An affiliate buying through their own link earns nothing. The conversion is still recorded,
 * with a `self_referral` outcome, so the admin can see why no commission exists.
 * Only catches exact email matches; it is a guard against the obvious case, not fraud scoring.
 */
export async function applySelfReferralGuard(
  decision: AttributionDecision,
  buyerEmail: string | null | undefined,
): Promise<AttributionDecision> {
  if (!decision.affiliateId || !normaliseEmail(buyerEmail)) return decision;

  const [person] = await db
    .select({ accountEmail: user.email, contactEmail: affiliate.contactEmail })
    .from(affiliate)
    .leftJoin(user, eq(affiliate.userId, user.id))
    .where(eq(affiliate.id, decision.affiliateId))
    .limit(1);
  if (!person || !isSelfReferralEmail(buyerEmail, [person.accountEmail, person.contactEmail])) return decision;

  return { ...decision, outcome: "self_referral", affiliateId: null, via: "none" };
}
