import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { ApplicationStatusBadge } from "@/features/affiliates/components/status-badge";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/features/affiliates/constants";
import { applicationCounts, listApplications } from "@/features/affiliates/server/queries";
import { requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: PageProps<"/dashboard/applications">) {
  await requireAdmin();
  const params = await searchParams;
  const status = typeof params.status === "string" && APPLICATION_STATUSES.includes(params.status as ApplicationStatus) ? (params.status as ApplicationStatus) : undefined;
  const [applications, counts] = await Promise.all([listApplications({ status }), applicationCounts()]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Applications"
        description="Review who wants to join the program. Approving an affiliate creates their referral code."
        actions={
          <Link href="/dashboard/affiliates/new">
            <Button variant="outline">Add affiliate manually</Button>
          </Link>
        }
      />

      <nav aria-label="Filter applications" className="flex flex-wrap gap-1">
        <FilterLink href="/dashboard/applications" active={!status} label="All" count={counts.pending + counts.approved + counts.rejected + counts.withdrawn} />
        {APPLICATION_STATUSES.map((item) => (
          <FilterLink key={item} href={`/dashboard/applications?status=${item}`} active={status === item} label={APPLICATION_STATUS_LABELS[item]} count={counts[item]} />
        ))}
      </nav>

      {applications.length === 0 ? (
        <Card className="py-12 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-medium">{status ? "No applications with this status" : "No applications yet"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Share{" "}
            <Link href="/partners" className="font-medium text-foreground underline underline-offset-4">
              the partner page
            </Link>{" "}
            to start receiving applications.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Applicant</th>
                  <th scope="col" className="px-4 py-3 font-medium">Channels</th>
                  <th scope="col" className="px-4 py-3 font-medium">Submitted</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/applications/${application.id}`} className="font-medium hover:underline">
                        {application.displayName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{application.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="line-clamp-1">{application.channels.join(", ") || "—"}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{application.createdAt.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3">
                      <ApplicationStatusBadge status={application.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/applications/${application.id}`} className="inline-flex items-center gap-1 text-xs font-medium hover:underline">
                        Review <ArrowRight className="size-3.5" aria-hidden="true" />
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
