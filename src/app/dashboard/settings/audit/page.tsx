import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { listAuditLogs } from "@/features/audit/server/list";

export const metadata: Metadata = { title: "Audit log" };

const LABELS: Record<string, string> = {
  "instance.setup_completed": "Instance set up",
  "program.settings_updated": "Program settings updated",
  "program.branding_updated": "Branding updated",
  "program.logo_updated": "Logo updated",
  "program.logo_removed": "Logo removed",
  "email.settings_updated": "Email settings updated",
  "email.test_sent": "Test email attempted",
  "question.created": "Question added",
  "question.updated": "Question updated",
  "question.activated": "Question shown",
  "question.deactivated": "Question hidden",
  "question.reordered": "Question reordered",
  "question.deleted": "Question deleted",
  "affiliate.link_created": "Affiliate link created",
  "affiliate.link_archived": "Affiliate link archived",
  "coupon.created": "Coupon created",
  "coupon.activated": "Coupon activated",
  "coupon.deactivated": "Coupon deactivated",
  "provider.connected": "Payment provider connected",
  "provider.activated": "Payment provider activated",
  "provider.disconnected": "Payment provider disconnected",
};

export default async function AuditLogPage({ searchParams }: PageProps<"/dashboard/settings/audit">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const rows = await listAuditLogs({ query });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="The most recent 100 consequential actions, newest first. Entries are append-only." />

      <form className="flex flex-wrap items-end gap-2" role="search">
        <label htmlFor="audit-search" className="sr-only">
          Search by action or target
        </label>
        <Input id="audit-search" name="q" defaultValue={query} placeholder="Search action or target" className="max-w-xs" />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {query && (
          <Link href="/dashboard/settings/audit" className="text-sm text-muted-foreground underline underline-offset-4">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <Card className="text-sm text-muted-foreground">
          {query ? `No activity matches “${query}”.` : "No activity recorded yet. Saving settings will add entries here."}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">When</th>
                <th scope="col" className="px-4 py-3 font-medium">Action</th>
                <th scope="col" className="px-4 py-3 font-medium">Actor</th>
                <th scope="col" className="px-4 py-3 font-medium">Target</th>
                <th scope="col" className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short" }).format(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="info">{LABELS[row.action] ?? row.action}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {row.actorName ? (
                      <span>
                        {row.actorName}
                        <span className="block text-xs text-muted-foreground">{row.actorEmail}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.targetType ? `${row.targetType}${row.targetId ? ` · ${row.targetId}` : ""}` : "—"}
                  </td>
                  <td className="max-w-[280px] px-4 py-3">
                    <code className="block truncate text-xs text-muted-foreground" title={JSON.stringify(row.metadata)}>
                      {Object.keys(row.metadata).length > 0 ? JSON.stringify(row.metadata) : "—"}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
