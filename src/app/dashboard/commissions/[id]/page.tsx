import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/field";
import { CommissionDecisionForm } from "@/features/commissions/components/decision-form";
import { CommissionStatusBadge } from "@/features/commissions/components/status-badge";
import { getCommissionDetail } from "@/features/commissions/server/queries";
import { requireAdmin } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Commission" };

export default async function CommissionDetailPage({ params }: PageProps<"/dashboard/commissions/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const row = await getCommissionDetail(id);
  if (!row) notFound();

  const canDecline = row.status === "pending";
  const canReverse = row.status === "approved" || row.status === "available";

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/commissions" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Commissions
      </Link>

      <PageHeader
        title={formatMoney(row.amountMinor, row.currency)}
        description={`${row.externalId} · ${formatDateTime(row.occurredAt)}`}
        actions={
          <div className="flex gap-1.5">
            <CommissionStatusBadge status={row.status} />
            {row.mode === "test" && <Badge tone="info">Test</Badge>}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card className="space-y-3 text-sm">
            <h2 className="font-medium">Money</h2>
            <Row label="Sale amount" value={formatMoney(row.saleAmountMinor, row.currency)} />
            <Row label="Commission" value={formatMoney(row.amountMinor, row.currency)} />
            <Row label="Original commission" value={formatMoney(row.originalAmountMinor, row.currency)} />
            <Row label="Refunded sale" value={formatMoney(row.refundedSaleAmountMinor, row.currency)} />
            <Row label="Currency" value={row.currency} />
            <Row
              label="Rate"
              value={
                row.rateType === "percent"
                  ? `${(row.rateBps ?? 0) / 100}% (${row.rateSource === "override" ? "affiliate override" : "program rate"})`
                  : `${formatMoney(row.rateFixedMinor ?? 0, row.currency)} fixed`
              }
            />
            <Row label="Recurring" value={row.recurring ? "Renewal payment" : "First payment"} />
          </Card>

          <Card className="space-y-3 text-sm">
            <h2 className="font-medium">Attribution</h2>
            <Row label="Affiliate" value={row.affiliateName} />
            <Row label="Type" value={row.isCustomerReferrer ? "Customer referrer" : "Partner"} />
            <Row label="Source" value={row.source} />
            <Row label="Via" value={row.attributedVia} />
            {row.couponCode && <Row label="Coupon" value={row.couponCode} />}
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Conversion</span>
              <Link href={`/dashboard/affiliates/${row.affiliateId}`} className="font-medium underline underline-offset-4">
                {row.conversionId}
              </Link>
            </div>
          </Card>

          <Card className="space-y-3 text-sm">
            <h2 className="font-medium">Lifecycle</h2>
            <Row label="Created" value={formatDateTime(row.createdAt)} />
            <Row label="Validation ends" value={formatDateTime(row.validationEndsAt)} />
            {row.availableAt && <Row label="Eligible from" value={formatDateTime(row.availableAt)} />}
            {row.approvedAt && <Row label="Approved" value={formatDateTime(row.approvedAt)} />}
            {row.paidAt && <Row label="Paid" value={formatDateTime(row.paidAt)} />}
            {row.declinedAt && <Row label="Declined" value={formatDateTime(row.declinedAt)} />}
            {row.reversedAt && <Row label="Reversed" value={formatDateTime(row.reversedAt)} />}
            {row.decisionReason && <Row label="Reason" value={row.decisionReason} />}
          </Card>

          {row.refunds.length > 0 && (
            <Card>
              <h2 className="text-sm font-medium">Refunds and chargebacks</h2>
              <ul className="mt-2 divide-y rounded-lg border text-sm">
                {row.refunds.map((refund) => (
                  <li key={refund.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div>
                      <p className="font-medium capitalize">{refund.kind}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(refund.createdAt)}</p>
                    </div>
                    <span>{formatMoney(refund.amountMinor, refund.currency)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {(canDecline || canReverse) && (
            <Card className="space-y-4">
              <div>
                <h2 className="text-sm font-medium">Decision</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {canDecline ? "Declining inside validation makes nothing payable. The affiliate is not notified automatically." : "Reversing removes this commission from the balance."}
                </p>
              </div>
              {canDecline && (
                <CommissionDecisionForm
                  id={row.id}
                  outcome="decline"
                  label="Decline commission"
                  confirmText="For example: cancelled before delivery, duplicate order or suspected fraud."
                />
              )}
              {canReverse && (
                <CommissionDecisionForm
                  id={row.id}
                  outcome="reverse"
                  label="Reverse commission"
                  confirmText="Reversing a paid commission is not possible here. Record an adjustment or refund instead."
                />
              )}
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-medium">History</h2>
            {row.events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No status changes yet.</p>
            ) : (
              <ol className="mt-3 space-y-3 text-sm">
                {row.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-3">
                    <p className="font-medium capitalize">
                      {event.fromStatus ? `${event.fromStatus} to ` : ""}
                      {event.toStatus}
                    </p>
                    {event.reason && <p className="text-xs text-muted-foreground">{event.reason}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[65%] text-right font-medium break-words capitalize">{value}</span>
    </div>
  );
}

function formatDateTime(value: Date) {
  return value.toLocaleString("en-IE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
