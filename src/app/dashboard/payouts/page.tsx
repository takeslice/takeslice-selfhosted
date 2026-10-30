import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/field";
import { PAYOUT_METHOD_LABELS, isPayoutMethod } from "@/features/payouts/constants";
import { listPayouts } from "@/features/payouts/server/payouts";
import { requireAdmin } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Payouts" };

const TONES = { pending: "warning", paid: "success", failed: "danger", cancelled: "neutral" } as const;

export default async function PayoutsPage() {
  await requireAdmin();
  const rows = await listPayouts();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Payouts"
        description="Payouts are sent outside TakeSlice and recorded here. A payout reserves the selected commissions until it is marked paid or cancelled."
      />

      {rows.length === 0 ? (
        <Card className="flex items-center gap-3 text-sm text-muted-foreground">
          <Wallet className="size-4" aria-hidden="true" /> No payouts yet. Open an affiliate to pay their available balance.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Affiliate</th>
                <th scope="col" className="px-4 py-3 font-medium">Amount</th>
                <th scope="col" className="px-4 py-3 font-medium">Method</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/payouts/${row.id}`} className="font-medium hover:underline">
                      {row.affiliateName}
                    </Link>
                    {row.reference && <span className="mt-0.5 block text-xs text-muted-foreground">{row.reference}</span>}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatMoney(row.amountMinor, row.currency)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{isPayoutMethod(row.method) ? PAYOUT_METHOD_LABELS[row.method] : row.method}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TONES[row.status]}>{row.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}
