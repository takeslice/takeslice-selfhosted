import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, click, referralLink } from "@/lib/db/schema";
import { hmacSha256Hex } from "@/lib/crypto";
import { UTM_FIELDS, UTM_PARAM_NAMES, type UtmField } from "@/features/links/constants";
import { destinationProblem } from "@/features/links/server/destination";
import type { TrackingMode } from "../attribution";

export interface ResolvedReferral {
  linkId: string | null;
  affiliateId: string;
  referralCode: string;
  destinationUrl: string;
  earning: boolean;
  sub: string | null;
  utm: Record<UtmField, string | null>;
}

const CODE_PATTERN = /^[a-z0-9]{4,32}$/;

/**
 * Resolves a referral code for a redirect. Unknown and non-earning codes still return the
 * program website so a shared link never dead-ends.
 */
export async function resolveReferral(code: string, websiteUrl: string): Promise<ResolvedReferral | null> {
  if (!CODE_PATTERN.test(code)) return null;

  const [row] = await db
    .select({
      linkId: referralLink.id,
      affiliateId: affiliate.id,
      referralCode: affiliate.referralCode,
      destinationUrl: referralLink.destinationUrl,
      archivedAt: referralLink.archivedAt,
      sub: referralLink.sub,
      utmSource: referralLink.utmSource,
      utmMedium: referralLink.utmMedium,
      utmCampaign: referralLink.utmCampaign,
      utmContent: referralLink.utmContent,
      utmTerm: referralLink.utmTerm,
      status: affiliate.status,
    })
    .from(referralLink)
    .innerJoin(affiliate, eq(referralLink.affiliateId, affiliate.id))
    .where(eq(referralLink.code, code))
    .limit(1);

  if (row) {
    const destinationIsSafe = destinationProblem(row.destinationUrl, websiteUrl) === null;
    return {
      linkId: row.linkId,
      affiliateId: row.affiliateId,
      referralCode: code,
      destinationUrl: destinationIsSafe ? row.destinationUrl : websiteUrl,
      earning: row.archivedAt === null && row.status === "approved" && destinationIsSafe,
      sub: row.sub,
      utm: Object.fromEntries(UTM_FIELDS.map((field) => [field, row[field]])) as Record<UtmField, string | null>,
    };
  }

  // Affiliates approved before link rows existed still resolve through their referral code.
  const [person] = await db
    .select({ id: affiliate.id, referralCode: affiliate.referralCode, status: affiliate.status })
    .from(affiliate)
    .where(and(eq(affiliate.referralCode, code), isNull(affiliate.rejectedAt)))
    .limit(1);
  if (!person) return null;

  return {
    linkId: null,
    affiliateId: person.id,
    referralCode: code,
    destinationUrl: websiteUrl,
    earning: person.status === "approved",
    sub: null,
    utm: Object.fromEntries(UTM_FIELDS.map((field) => [field, null])) as Record<UtmField, string | null>,
  };
}

export function trackedDestination(referral: ResolvedReferral, clickId: string): string {
  const url = new URL(referral.destinationUrl);
  url.searchParams.set("tscid", clickId);
  if (referral.sub) url.searchParams.set("sub", referral.sub);
  for (const field of UTM_FIELDS) {
    const value = referral.utm[field];
    if (value && !url.searchParams.has(UTM_PARAM_NAMES[field])) url.searchParams.set(UTM_PARAM_NAMES[field], value);
  }
  return url.toString();
}

export interface ClickInput {
  /** Generated before the redirect so the same ID can be sent to the destination. */
  id: string;
  linkId: string | null;
  affiliateId: string;
  mode: TrackingMode;
  ip: string;
  referrerHost: string | null;
  userAgent: string | null;
  sub: string | null;
  landingUrl: string;
  country: string | null;
}

export async function recordClick(input: ClickInput): Promise<void> {
  await db.insert(click).values({
    id: input.id,
    linkId: input.linkId,
    affiliateId: input.affiliateId,
    mode: input.mode,
    ipHash: input.ip === "unknown" ? null : hmacSha256Hex(input.ip),
    country: input.country && /^[A-Za-z]{2}$/.test(input.country) ? input.country.toUpperCase() : null,
    referrerHost: input.referrerHost,
    userAgent: input.userAgent,
    sub: input.sub,
    landingUrl: input.landingUrl,
  });
}
