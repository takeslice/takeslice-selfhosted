import type { Metadata } from "next";
import Link from "next/link";
import { Coins } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/field";
import { CommissionStatusBadge } from "@/features/commissions/components/status-badge";
import { isCommissionStatus, listCommissions } from "@/features/commissions/server/queries";
import { requireAdmin } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Commissions" };

const FILTERS = ["all", "pending", "approved", "available", "paid", "declined", "reversed"] as const;

export default async function CommissionsPage({ searchParams }: PageProps<"/dashboard/commissions">) {
  await requireAdmin();
  const params = await searchParams;
  const statusParam = typeof params.status === "string" ? params.status : undefined;
  const status = isCommissionStatus(statusParam) ? statusParam : undefined;
  const mode = params.mode === "test" ? "test" : params.mode === "live" ? "live" : undefined;
  const rows = await listCommissions({ status, mode });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Commissions"
        description="Every attributed sale, its validation state and anything refunded or reversed. Test commissions never create payable money."
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = filter === "all" ? !status : status === filter;
          const query = new URLSearchParams();
          if (filter !== "all") query.set("status", filter);
          if (mode) query.set("mode", mode);
          return (
            <Link
              key={filter}
              href={`/dashboard/commissions${query.size ? `?${query}` : ""}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              aria-current={active ? "page" : undefined}
            >
              {filter}
            </Link>
          );
        })}
        <span className="mx-1 h-6 w-px self-center bg-border" aria-hidden="true" />
        {(["live", "test"] as const).map((value) => {
          const active = mode === value;
          const query = new URLSearchParams();
          if (status) query.set("status", status);
          query.set("mode", value);
          return (
            <Link
              key={value}
              href={`/dashboard/commissions?${query}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              aria-current={active ? "page" : undefined}
            >
              {value}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card className="flex items-center gap-3 text-sm text-muted-foreground">
          <Coins className="size-4" aria-hidden="true" />
          {status || mode ? "No commissions match this filter." : "No commissions yet. Connect a payment provider and share a referral link."}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Sale</th>
                <th scope="col" className="px-4 py-3 font-medium">Affiliate</th>
                <th scope="col" className="px-4 py-3 font-medium">Commission</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/commissions/${row.id}`} className="font-medium hover:underline">
                      {row.externalId}
                    </Link>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDate(row.occurredAt)}
                      {row.recurring ? " · renewal" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/affiliates/${row.affiliateId}`} className="hover:underline">
                      {row.affiliateName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{formatMoney(row.amountMinor, row.currency)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">of {formatMoney(row.saleAmountMinor, row.currency)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CommissionStatusBadge status={row.status} />
                      {row.mode === "test" && <Badge tone="info">Test</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{nextStep(row.status, row.validationEndsAt, row.availableAt, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function nextStep(status: string, validationEndsAt: Date, availableAt: Date | null, currency: string) {
  if (status === "pending") return `Valid until ${formatDate(validationEndsAt)}`;
  if (status === "approved") return availableAt ? `Available ${formatDate(availableAt)}` : "Waiting for holding period";
  if (status === "available") return "Eligible for payout";
  if (status === "paid") return `Paid in ${currency}`;
  if (status === "declined") return "Not payable";
  return "Reversed";
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}
