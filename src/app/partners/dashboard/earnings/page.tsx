import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/field";
import { getAffiliateForUser } from "@/features/affiliates/server/queries";
import { CommissionStatusBadge } from "@/features/commissions/components/status-badge";
import { affiliateCommissionTotals, affiliateCommissions } from "@/features/commissions/server/queries";
import { PayoutDetailsForm } from "@/features/payouts/components/payout-details-form";
import { PAYOUT_METHOD_LABELS, isPayoutMethod } from "@/features/payouts/constants";
import { affiliateBalance, affiliatePayoutDetails, listPayouts } from "@/features/payouts/server/payouts";
import { getProgramSettings } from "@/features/program/server/settings";
import { requireAffiliate } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Earnings", robots: { index: false } };

export default async function PartnerEarningsPage() {
  const session = await requireAffiliate();
  const [person, settings] = await Promise.all([getAffiliateForUser(session.user.id), getProgramSettings()]);
  if (!person) redirect("/partners/dashboard");
  if (!settings) redirect("/partners/dashboard");

  if (person.status !== "approved") {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/partners/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Partner dashboard
        </Link>
        <Card className="mt-4">
          <h1 className="text-lg font-semibold tracking-tight">Earnings are available after approval</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your account is {person.status}. Commissions only accrue for approved partners.</p>
        </Card>
      </main>
    );
  }

  const [totals, balance, commissions, payouts, payoutDetails] = await Promise.all([
    affiliateCommissionTotals(person.id),
    affiliateBalance(person.id, settings.currency),
    affiliateCommissions(person.id),
    listPayouts(person.id),
    affiliatePayoutDetails(person.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/partners/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Partner dashboard
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A sale moves from pending to approved after the validation period, then to available after the holding period. Only available money can be paid out.
        </p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Available" value={formatMoney(balance.availableMinor, settings.currency)} hint="Ready for payout" />
        <Stat label="Approved" value={formatMoney(totals.approvedMinor, settings.currency)} hint="Waiting for holding period" />
        <Stat label="Pending" value={formatMoney(totals.pendingMinor, settings.currency)} hint="Inside validation" />
        <Stat label="Paid" value={formatMoney(totals.paidMinor, settings.currency)} hint="Sent to you" />
      </div>

      {totals.reversedMinor > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Reversed commissions: {formatMoney(totals.reversedMinor, settings.currency)}.</p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-medium">Commissions</h2>
            {commissions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No commissions yet. Share your referral link to start earning.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 font-medium">Sale</th>
                      <th scope="col" className="py-2 font-medium">Amount</th>
                      <th scope="col" className="py-2 font-medium">Status</th>
                      <th scope="col" className="py-2 font-medium">Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2.5">
                          <span className="font-medium">{row.externalId}</span>
                          {row.recurring && <span className="ml-1.5 text-xs text-muted-foreground">renewal</span>}
                        </td>
                        <td className="py-2.5">{formatMoney(row.amountMinor, row.currency)}</td>
                        <td className="py-2.5">
                          <CommissionStatusBadge status={row.status} />
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">
                          {row.status === "pending"
                            ? `Valid until ${formatDate(row.validationEndsAt)}`
                            : row.paidAt
                              ? `Paid ${formatDate(row.paidAt)}`
                              : row.status === "available"
                                ? "Available"
                                : formatDate(row.occurredAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-medium">Payouts</h2>
            {payouts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No payouts yet. The business can pay you once your available balance reaches {formatMoney(settings.minimumPayoutMinor, settings.currency)}.
              </p>
            ) : (
              <ul className="mt-3 divide-y rounded-lg border text-sm">
                {payouts.map((payout) => (
                  <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <div>
                      <p className="font-medium">{formatMoney(payout.amountMinor, payout.currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {isPayoutMethod(payout.method) ? PAYOUT_METHOD_LABELS[payout.method] : payout.method} · {formatDate(payout.createdAt)}
                        {payout.reference ? ` · ${payout.reference}` : ""}
                      </p>
                    </div>
                    <Badge tone={payout.status === "paid" ? "success" : payout.status === "pending" ? "warning" : "neutral"}>{payout.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              <Info className="size-4 text-muted-foreground" aria-hidden="true" /> How your balance works
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li>Pending commissions are inside the validation period and can still be declined or refunded.</li>
              <li>Approved commissions passed validation and are waiting for the holding period.</li>
              <li>Available commissions can be included in a payout.</li>
              <li>The minimum payout for this program is {formatMoney(settings.minimumPayoutMinor, settings.currency)}.</li>
            </ul>
          </Card>

          <Card>
            <h2 className="text-sm font-medium">Payout details</h2>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              {payoutDetails?.updatedAt
                ? `Last updated ${formatDate(payoutDetails.updatedAt)}.`
                : "Add where the business should send your payouts."}
            </p>
            <PayoutDetailsForm method={payoutDetails?.method ?? null} details={payoutDetails?.details ?? null} />
          </Card>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}
