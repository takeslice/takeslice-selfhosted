import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plug } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/field";
import { DisconnectProviderForm } from "@/features/providers/components/disconnect-provider-form";
import { ProviderConnectForm } from "@/features/providers/components/provider-connect-form";
import { providerInfo } from "@/features/providers/constants";
import { listProviderConnections, webhookUrl } from "@/features/providers/server/connections";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Providers" };

function when(value: Date | null) {
  if (!value) return "No events yet";
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function ProvidersPage() {
  await requireAdmin();
  const connections = await listProviderConnections();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payment providers"
        description="Turn completed payments into attributed conversions without trusting client-side amounts."
        actions={
          <Link href="/dashboard/providers/events" className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4">
            Delivery log <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      <ProviderConnectForm />

      <section aria-labelledby="connections" className="space-y-3">
        <h2 id="connections" className="text-sm font-medium">
          Connections
        </h2>
        {connections.length === 0 ? (
          <Card className="flex items-start gap-3 text-sm text-muted-foreground">
            <Plug className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">No providers connected yet.</p>
              <p className="mt-1">Connect the payment provider that handles your checkout. Conversions from the API still work without one.</p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {connections.map((connection) => {
              const info = providerInfo(connection.provider);
              return (
                <Card key={connection.id} className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium">{info.label}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {connection.mode === "live" ? "Live mode" : "Test mode"} · {connection.credentialHint ?? "No credential saved"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={connection.mode === "live" ? "success" : "warning"}>{connection.mode === "live" ? "Live" : "Test"}</Badge>
                      <Badge
                        tone={
                          connection.status === "active" ? "success" : connection.status === "pending" ? "warning" : "neutral"
                        }
                      >
                        {connection.status === "active" ? "Active" : connection.status === "pending" ? "Needs attention" : "Disconnected"}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">
                      Webhook URL
                      <code className="mt-1 block rounded-lg border bg-muted/40 px-3 py-2 text-xs break-all">
                        {webhookUrl(connection.provider, connection.id)}
                      </code>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Events: <span className="font-mono">{info.webhookEvents.join(", ")}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Last delivery: {when(connection.lastEventAt)}</p>
                    {connection.lastError && <p className="text-xs text-destructive">Last error: {connection.lastError}</p>}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <Link
                      href="/dashboard/providers/events"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      View events <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    <DisconnectProviderForm id={connection.id} label={info.label} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
