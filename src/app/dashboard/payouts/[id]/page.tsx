import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/field";
import { CancelPayoutForm, MarkPayoutPaidForm } from "@/features/payouts/components/payout-actions";
import { PAYOUT_METHOD_LABELS, isPayoutMethod } from "@/features/payouts/constants";
import { getPayoutDetails } from "@/features/payouts/server/payouts";
import { requireAdmin } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Payout" };

const TONES = { pending: "warning", paid: "success", failed: "danger", cancelled: "neutral" } as const;

export default async function PayoutDetailPage({ params }: PageProps<"/dashboard/payouts/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const row = await getPayoutDetails(id);
  if (!row) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/payouts" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Payouts
      </Link>

      <PageHeader
        title={formatMoney(row.amountMinor, row.currency)}
        description={`${row.affiliateName} · created ${formatDateTime(row.createdAt)}`}
        actions={<Badge tone={TONES[row.status]}>{row.status}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card className="space-y-3 text-sm">
            <h2 className="font-medium">Payment</h2>
            <Row label="Affiliate" value={row.affiliateName} />
            <Row label="Method" value={isPayoutMethod(row.method) ? PAYOUT_METHOD_LABELS[row.method] : row.method} />
            <Row label="Reference" value={row.reference ?? "Not recorded"} />
            {row.paidAt && <Row label="Paid" value={formatDateTime(row.paidAt)} />}
            {row.cancelledAt && <Row label="Cancelled" value={formatDateTime(row.cancelledAt)} />}
            {row.note && <Row label="Note" value={row.note} />}
          </Card>

          <Card>
            <h2 className="text-sm font-medium">Details sent at creation</h2>
            {row.detailsSnapshot ? (
              <pre className="mt-2 max-h-56 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">{row.detailsSnapshot}</pre>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No payout details were saved when this payout was created, or they could not be decrypted. Ask the affiliate for payment details.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">This is a snapshot. Later changes to the affiliate&apos;s details do not change this payout.</p>
          </Card>

          <Card>
            <h2 className="text-sm font-medium">Reserved items</h2>
            {row.items.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No items are reserved. A cancelled payout releases them.</p>
            ) : (
              <ul className="mt-2 divide-y rounded-lg border text-sm">
                {row.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div>
                      {item.commissionId ? (
                        <Link href={`/dashboard/commissions/${item.commissionId}`} className="font-medium hover:underline">
                          Commission {item.commissionId}
                        </Link>
                      ) : (
                        <span className="font-medium">Adjustment {item.adjustmentId}</span>
                      )}
                      {item.commissionStatus && <span className="block text-xs text-muted-foreground capitalize">{item.commissionStatus}</span>}
                    </div>
                    <span className="font-medium">{formatMoney(item.amountMinor, row.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">The total above is the sum of these items at creation.</p>
          </Card>
        </div>

        <div className="space-y-4">
          {row.status === "pending" && (
            <>
              <Card>
                <h2 className="text-sm font-medium">Confirm the transfer</h2>
                <p className="mt-1 mb-3 text-xs text-muted-foreground">Only mark paid after the money has actually left your account.</p>
                <MarkPayoutPaidForm id={row.id} />
              </Card>
              <Card>
                <h2 className="text-sm font-medium">Cancel</h2>
                <p className="mt-1 mb-3 text-xs text-muted-foreground">Use this if the transfer will not happen.</p>
                <CancelPayoutForm id={row.id} />
              </Card>
            </>
          )}
          {row.status === "paid" && (
            <Card className="text-sm text-muted-foreground">
              This payout is complete. Its commissions are marked paid and a negative ledger entry was recorded.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[65%] text-right font-medium break-words">{value}</span>
    </div>
  );
}

function formatDateTime(value: Date) {
  return value.toLocaleString("en-IE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
