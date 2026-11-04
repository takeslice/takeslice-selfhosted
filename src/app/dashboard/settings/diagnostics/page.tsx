import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert, Card } from "@/components/ui/field";
import { getDiagnosticsOverview } from "@/features/diagnostics/server/overview";
import { providerInfo } from "@/features/providers/constants";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Diagnostics" };
export const dynamic = "force-dynamic";

const WORKER_STALE_MS = 60_000;
const WORKER_INTERVAL_MS = 5_000;

function formatWhen(value: Date | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "medium" }).format(value);
}

function describeAge(value: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - value.getTime()) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export default async function DiagnosticsPage() {
  await requireAdmin();
  const data = await getDiagnosticsOverview();
  const now = data.checkedAt;
  const lastSeenAt = data.worker.lastSeenAt;
  const workerAge = lastSeenAt ? now.getTime() - lastSeenAt.getTime() : null;
  const workerHealthy = workerAge !== null && workerAge <= WORKER_STALE_MS;
  const waitingWork = data.commissions.duePending + data.commissions.dueApproved + data.jobs.queued;
  const activeProviders = data.providers.filter((connection) => connection.status === "active").length;
  const workerMessage = !lastSeenAt
    ? "No worker has reported yet. Pending commissions will not mature and queued email will not be sent until the worker starts. If this is a manual install, run `pnpm worker`."
    : workerHealthy
      ? `Last check-in ${describeAge(lastSeenAt, now)}. Commissions mature and queued email is delivered on each ${WORKER_INTERVAL_MS / 1000}-second cycle.`
      : `Last check-in ${describeAge(lastSeenAt, now)}. Until it runs again, pending commissions will not mature and queued email will not be sent. Restart the worker service and check its logs.`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Diagnostics"
        description="Check that background work, email delivery, and payment-provider connections are doing what they should. Values are read directly from this instance when the page loads."
      />

      <Alert tone={workerHealthy ? "success" : "warning"}>
        <strong>{workerHealthy ? "Background worker is running." : "Background worker has not checked in recently."}</strong> {workerMessage}
      </Alert>

      <section aria-labelledby="worker" className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 id="worker" className="text-sm font-medium">
            Background work
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Worker host</dt>
            <dd>{data.worker.hostname ?? "—"}</dd>
            <dt className="text-muted-foreground">Last check-in</dt>
            <dd>{formatWhen(data.worker.lastSeenAt)}</dd>
            <dt className="text-muted-foreground">Queued jobs</dt>
            <dd>{data.jobs.queued}</dd>
            <dt className="text-muted-foreground">Running jobs</dt>
            <dd>{data.jobs.running}</dd>
            <dt className="text-muted-foreground">Failed jobs</dt>
            <dd>{data.jobs.failed}</dd>
            <dt className="text-muted-foreground">Oldest queued</dt>
            <dd>{data.jobs.oldestQueuedAt ? `${formatWhen(data.jobs.oldestQueuedAt)} (${describeAge(data.jobs.oldestQueuedAt, now)})` : "—"}</dd>
          </dl>
          {data.jobs.failed > 0 && (
            <Alert tone="warning">
              {data.jobs.failed} job{data.jobs.failed === 1 ? "" : "s"} exhausted the retry limit. They are not retried automatically. Check the worker logs for the failure reason.
            </Alert>
          )}
          {waitingWork > 0 && !workerHealthy && (
            <p className="text-sm text-muted-foreground">
              {data.commissions.duePending} pending and {data.commissions.dueApproved} approved commission{data.commissions.dueApproved === 1 ? "" : "s"} are past
              their scheduled time, plus {data.jobs.queued} queued job{data.jobs.queued === 1 ? "" : "s"}.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Email delivery</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Mode</dt>
            <dd>
              {data.email.mode === "smtp" ? "SMTP" : data.email.mode === "outbox" ? "Development outbox" : "Not configured"}
            </dd>
            <dt className="text-muted-foreground">SMTP host</dt>
            <dd>{data.email.host ?? "—"}</dd>
            <dt className="text-muted-foreground">From address</dt>
            <dd className="break-all">{data.email.fromEmail ?? "—"}</dd>
            <dt className="text-muted-foreground">Last test</dt>
            <dd>{formatWhen(data.email.lastTestedAt)}</dd>
            <dt className="text-muted-foreground">Failed notifications</dt>
            <dd>{data.email.failedDeliveries}</dd>
          </dl>
          {data.email.mode === "not_configured" && (
            <Alert tone="error">
              Email is not configured. Partners cannot verify their address, reset a password, or receive application and payout notices.{" "}
              <Link href="/dashboard/settings/email" className="font-medium underline underline-offset-4">
                Set up SMTP
              </Link>
              .
            </Alert>
          )}
          {data.email.mode === "outbox" && (
            <Alert tone="warning">
              Email is being written to the development outbox instead of being sent. Use this only for testing; configure SMTP before inviting partners.
            </Alert>
          )}
          {data.email.lastTestError && <Alert tone="error">The last test failed: {data.email.lastTestError}</Alert>}
          {data.email.failedDeliveries > 0 && (
            <Alert tone="warning">
              {data.email.failedDeliveries} notification email{data.email.failedDeliveries === 1 ? "" : "s"} failed to send. The in-app notification is still
              available; check the SMTP settings and worker logs.
            </Alert>
          )}
        </Card>
      </section>

      <section aria-labelledby="commissions" className="flex flex-col gap-3">
        <h2 id="commissions" className="text-sm font-medium">
          Commission queues
        </h2>
        <Card className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Pending</p>
            <p className="mt-0.5 text-lg font-semibold">{data.commissions.pending}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Waiting for validation to pass</p>
            <p className="mt-0.5 text-lg font-semibold">{data.commissions.duePending}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Waiting for holding period to pass</p>
            <p className="mt-0.5 text-lg font-semibold">{data.commissions.dueApproved}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Available for payout</p>
            <p className="mt-0.5 text-lg font-semibold">{data.commissions.available}</p>
          </div>
        </Card>
        <p className="text-sm text-muted-foreground">
          “Waiting” counts are due now. The worker moves pending commissions through validation, then through the holding period, to available.{" "}
          <Link href="/dashboard/commissions" className="underline underline-offset-4">
            Open commissions
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="providers" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="providers" className="text-sm font-medium">
            Payment providers
          </h2>
          <Link href="/dashboard/providers" className="text-sm underline underline-offset-4">
            Manage providers
          </Link>
        </div>
        {data.providers.length === 0 ? (
          <Card className="text-sm text-muted-foreground">
            No provider is connected. Conversions sent through the API still work; connect a provider to accept signed webhooks.
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Provider</th>
                  <th scope="col" className="px-4 py-3 font-medium">Mode</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last event</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last error</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((connection) => (
                  <tr key={connection.id} className="border-b align-top last:border-0">
                    <td className="px-4 py-3">{providerInfo(connection.provider).label}</td>
                    <td className="px-4 py-3">
                      <Badge tone={connection.mode === "live" ? "success" : "warning"}>{connection.mode === "live" ? "Live" : "Test"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={connection.status === "active" ? "success" : connection.status === "pending" ? "warning" : "neutral"}>
                        {connection.status === "active" ? "Active" : connection.status === "pending" ? "Needs attention" : "Disconnected"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatWhen(connection.lastEventAt)}</td>
                    <td className="max-w-[280px] px-4 py-3 text-muted-foreground">
                      {connection.lastError ? <span className="break-words">{connection.lastError}</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeProviders === 0 && data.providers.length > 0 && (
          <Alert tone="warning">No provider connection is active, so signed webhooks are currently rejected. Activate a connection or send conversions through the API.</Alert>
        )}
      </section>

      <section aria-labelledby="instance" className="flex flex-col gap-3">
        <h2 id="instance" className="text-sm font-medium">
          Instance
        </h2>
        <Card className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Application URL</p>
            <p className="mt-0.5 break-all">{env.APP_URL}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Setup completed</p>
            <p className="mt-0.5">{formatWhen(data.instance.setupCompletedAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Snapshot taken</p>
            <p className="mt-0.5">{formatWhen(data.checkedAt)}</p>
          </div>
        </Card>
        <p className="text-sm text-muted-foreground">
          For webhook outcomes, see the{" "}
          <Link href="/dashboard/providers/events" className="underline underline-offset-4">
            delivery log
          </Link>
          . For setup and troubleshooting, see the development and provider documentation.
        </p>
      </section>
    </div>
  );
}
