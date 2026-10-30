import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert, Card } from "@/components/ui/field";
import { listAffiliates } from "@/features/affiliates/server/queries";
import { CouponForm } from "@/features/coupons/components/coupon-form";
import { CouponStatusForm } from "@/features/coupons/components/coupon-status-form";
import { listCoupons } from "@/features/coupons/server/coupons";
import { getProgramSettings } from "@/features/program/server/settings";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Coupons" };

export default async function CouponsPage() {
  await requireAdmin();
  const [settings, affiliates, coupons] = await Promise.all([getProgramSettings(), listAffiliates({ status: "approved" }), listCoupons()]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Coupons" description="Codes that credit an affiliate when a sale uses them without a valid click from someone else." />

      {settings?.couponMode === "disabled" ? (
        <Alert tone="info">
          Coupons are turned off. Enable them under{" "}
          <Link href="/dashboard/settings/program" className="font-medium underline underline-offset-4">
            program rules
          </Link>{" "}
          before adding a code.
        </Alert>
      ) : affiliates.length === 0 ? (
        <Card className="text-sm text-muted-foreground">Approve an affiliate before assigning a coupon.</Card>
      ) : (
        <CouponForm affiliates={affiliates.map((person) => ({ id: person.id, name: person.displayName, email: person.userEmail }))} />
      )}

      <section aria-labelledby="coupon-list" className="space-y-3">
        <h2 id="coupon-list" className="text-sm font-medium">
          All coupons
        </h2>
        {coupons.length === 0 ? (
          <Card className="flex items-center gap-3 text-sm text-muted-foreground">
            <Ticket className="size-4" aria-hidden="true" /> No coupons yet.
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Code</th>
                  <th scope="col" className="px-4 py-3 font-medium">Affiliate</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Provider</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((code) => (
                  <tr key={code.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <code className="font-medium">{code.code}</code>
                      {(code.discountPercent || code.discountText) && (
                        <span className="block text-xs text-muted-foreground">
                          {code.discountPercent ? `${code.discountPercent}% off` : code.discountText}
                          {code.discountPercent && code.discountText ? ` · ${code.discountText}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/affiliates/${code.affiliateId}`} className="hover:underline">
                        {code.affiliateName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={code.status === "active" ? "success" : "neutral"}>{code.status === "active" ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="max-w-72 px-4 py-3 text-muted-foreground">
                      {code.syncStatus === "synced" ? (
                        "Stripe · synced"
                      ) : code.syncStatus === "error" ? (
                        <span className="text-destructive">
                          Stripe · sync failed
                          {code.lastError && <span className="mt-1 block text-xs break-words">{code.lastError}</span>}
                        </span>
                      ) : (
                        "Not synced"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CouponStatusForm
                        id={code.id}
                        status={code.status}
                        canSync={Boolean(code.discountPercent)}
                        synced={code.syncStatus === "synced"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
