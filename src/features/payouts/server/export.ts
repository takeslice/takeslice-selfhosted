import { and, asc, eq } from "drizzle-orm";
import { affiliate, user } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { getProgramSettings } from "@/features/program/server/settings";
import { PAYOUT_METHOD_LABELS, isPayoutMethod } from "../constants";
import { minorToDecimal, toCsv } from "../csv";
import { affiliateBalance, affiliatePayoutDetails } from "./payouts";

const HEADER = [
  "affiliate_id",
  "affiliate",
  "email",
  "amount",
  "currency",
  "payout_method",
  "payout_details",
  "already_pending_payout",
] as const;

/**
 * One row per approved affiliate whose available balance reaches the program minimum, with the
 * decrypted payout details, so the admin can pay a batch from a spreadsheet or a PayPal/Wise
 * bulk file and then mark each payout paid. Admin-only; the caller must enforce that.
 */
export async function payableBalancesCsv(): Promise<string> {
  const settings = await getProgramSettings();
  if (!settings) return toCsv(HEADER, []);

  const people = await db
    .select({
      id: affiliate.id,
      name: affiliate.displayName,
      contactEmail: affiliate.contactEmail,
      accountEmail: user.email,
    })
    .from(affiliate)
    .leftJoin(user, eq(affiliate.userId, user.id))
    .where(and(eq(affiliate.status, "approved")))
    .orderBy(asc(affiliate.displayName));

  const rows: Array<Array<string | number | null>> = [];
  for (const person of people) {
    const balance = await affiliateBalance(person.id, settings.currency);
    if (balance.availableMinor <= 0 || balance.availableMinor < settings.minimumPayoutMinor) continue;
    const details = await affiliatePayoutDetails(person.id);
    const method = details?.method ?? null;
    rows.push([
      person.id,
      person.name,
      person.accountEmail ?? person.contactEmail,
      minorToDecimal(balance.availableMinor, settings.currency),
      settings.currency,
      isPayoutMethod(method) ? PAYOUT_METHOD_LABELS[method] : "Not set",
      details?.details ?? "",
      balance.pendingPayoutMinor > 0 ? "yes" : "no",
    ]);
  }
  return toCsv(HEADER, rows);
}
