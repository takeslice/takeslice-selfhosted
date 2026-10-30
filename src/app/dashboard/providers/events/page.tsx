import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/field";
import { providerInfo } from "@/features/providers/constants";
import { listRecentProviderEvents } from "@/features/providers/server/queries";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Provider events" };

const OUTCOMES = {
  processed: { label: "Processed", tone: "success" },
  duplicate: { label: "Duplicate", tone: "neutral" },
  ignored: { label: "Ignored", tone: "warning" },
  deferred: { label: "Deferred", tone: "warning" },
  processing: { label: "Processing", tone: "info" },
} as const;

function when(value: Date) {
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function ProviderEventsPage() {
  await requireAdmin();
  const events = await listRecentProviderEvents();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/providers" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Providers
      </Link>
      <PageHeader title="Provider events" description="Every accepted delivery, what it became and why any delivery was ignored." />

      {events.length === 0 ? (
        <Card className="text-sm text-muted-foreground">
          No webhook deliveries yet. Connect a provider and send a test event, or use the conversion API.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Provider</th>
                <th scope="col" className="px-4 py-3 font-medium">Event</th>
                <th scope="col" className="px-4 py-3 font-medium">Outcome</th>
                <th scope="col" className="px-4 py-3 font-medium">Conversion</th>
                <th scope="col" className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const tone = OUTCOMES[event.outcome] ?? OUTCOMES.ignored;
                return (
                  <tr key={event.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{providerInfo(event.provider).label}</span>
                      <span className="block text-xs text-muted-foreground">{event.mode === "live" ? "Live" : "Test"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{event.type ?? "unknown"}</span>
                      <span className="mt-1 block max-w-56 truncate font-mono text-[11px] text-muted-foreground" title={event.providerEventId}>
                        {event.providerEventId}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={tone.tone}>{tone.label}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{event.conversionId ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{when(event.receivedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
