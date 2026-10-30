import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AffiliateStatusBadge } from "@/features/affiliates/components/status-badge";
import { AFFILIATE_STATUSES, AFFILIATE_STATUS_LABELS, type AffiliateStatus } from "@/features/affiliates/constants";
import { affiliateCounts, listAffiliates } from "@/features/affiliates/server/queries";
import { requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Affiliates" };

export default async function AffiliatesPage({ searchParams }: PageProps<"/dashboard/affiliates">) {
  await requireAdmin();
  const params = await searchParams;
  const status = typeof params.status === "string" && AFFILIATE_STATUSES.includes(params.status as AffiliateStatus) ? (params.status as AffiliateStatus) : undefined;
  const query = typeof params.q === "string" ? params.q : "";
  const [affiliates, counts] = await Promise.all([listAffiliates({ status, query }), affiliateCounts()]);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Affiliates"
        description="Everyone in the program, their status and their referral code."
        actions={
          <Link href="/dashboard/affiliates/new">
            <Button>Add affiliate</Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter affiliates" className="flex flex-wrap gap-1">
          <FilterLink href={query ? `/dashboard/affiliates?q=${encodeURIComponent(query)}` : "/dashboard/affiliates"} active={!status} label="All" count={total} />
          {AFFILIATE_STATUSES.map((item) => (
            <FilterLink
              key={item}
              href={`/dashboard/affiliates?status=${item}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              active={status === item}
              label={AFFILIATE_STATUS_LABELS[item]}
              count={counts[item] ?? 0}
            />
          ))}
        </nav>

        <form action="/dashboard/affiliates" className="flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="affiliate-search" className="sr-only">
            Search affiliates
          </label>
          <Input id="affiliate-search" name="q" type="search" placeholder="Name or email" defaultValue={query} className="h-9 w-full sm:w-56" />
          <Button type="submit" variant="outline" size="sm">
            <Search /> Search
          </Button>
        </form>
      </div>

      {affiliates.length === 0 ? (
        <Card className="py-12 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-medium">{query || status ? "No affiliates match" : "No affiliates yet"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {query || status ? (
              <>
                Try a different search or{" "}
                <Link href="/dashboard/affiliates" className="font-medium text-foreground underline underline-offset-4">
                  clear the filters
                </Link>
                .
              </>
            ) : (
              "Approve an application or add an affiliate manually."
            )}
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Affiliate</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Referral code</th>
                  <th scope="col" className="px-4 py-3 font-medium">Override</th>
                  <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {affiliates.map((person) => (
                  <tr key={person.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/affiliates/${person.id}`} className="font-medium hover:underline">
                        {person.displayName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{person.userEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <AffiliateStatusBadge status={person.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{person.referralCode ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{person.commissionOverrideBps !== null ? `${person.commissionOverrideBps / 100}%` : "Program rate"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{person.createdAt.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/affiliates/${person.id}`} className="inline-flex items-center gap-1 text-xs font-medium hover:underline">
                        Open <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FilterLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm",
        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{count}</span>
    </Link>
  );
}
