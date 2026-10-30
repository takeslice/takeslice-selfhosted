import "server-only";
import { and, count, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { commission, instance, job, notification, providerConnection, workerHeartbeat } from "@/lib/db/schema";
import { getEmailSettings } from "@/lib/email";
import { env } from "@/lib/env";

export interface DiagnosticsOverview {
  instance: { setupCompletedAt: Date | null };
  worker: { lastSeenAt: Date | null; hostname: string | null };
  jobs: { queued: number; running: number; failed: number; oldestQueuedAt: Date | null };
  commissions: { pending: number; approved: number; available: number; duePending: number; dueApproved: number };
  email: {
    mode: "outbox" | "smtp" | "not_configured";
    host: string | null;
    fromEmail: string | null;
    lastTestedAt: Date | null;
    lastTestError: string | null;
    failedDeliveries: number;
  };
  providers: {
    id: string;
    provider: "stripe" | "paddle" | "lemonsqueezy" | "dodo" | "polar" | "revenuecat" | "shopify" | "woocommerce";
    mode: "live" | "test";
    status: "pending" | "active" | "disconnected";
    lastEventAt: Date | null;
    lastError: string | null;
  }[];
  checkedAt: Date;
}

/**
 * Read-only health snapshot for the admin diagnostics page. Every value is read from the
 * database; nothing here probes external services or treats cached state as authoritative.
 */
export async function getDiagnosticsOverview(): Promise<DiagnosticsOverview> {
  const now = new Date();

  const [
    instanceRow,
    heartbeatRow,
    jobRows,
    oldestQueuedRow,
    commissionRows,
    duePendingRow,
    dueApprovedRow,
    emailRow,
    failedDeliveryRow,
    providerRows,
  ] = await Promise.all([
    db.select({ setupCompletedAt: instance.setupCompletedAt }).from(instance).where(eq(instance.id, "default")).limit(1),
    db.select({ hostname: workerHeartbeat.hostname, lastSeenAt: workerHeartbeat.lastSeenAt }).from(workerHeartbeat).orderBy(desc(workerHeartbeat.lastSeenAt)).limit(1),
    db.select({ status: job.status, total: count() }).from(job).groupBy(job.status),
    db
      .select({ runAt: job.runAt })
      .from(job)
      .where(eq(job.status, "queued"))
      .orderBy(job.runAt)
      .limit(1),
    db.select({ status: commission.status, total: count() }).from(commission).groupBy(commission.status),
    db
      .select({ total: count() })
      .from(commission)
      .where(and(eq(commission.status, "pending"), lte(commission.validationEndsAt, now))),
    db
      .select({ total: count() })
      .from(commission)
      .where(and(eq(commission.status, "approved"), lte(commission.availableAt, now))),
    getEmailSettings(),
    db
      .select({ total: count() })
      .from(notification)
      .where(eq(notification.emailStatus, "failed")),
    db
      .select({
        id: providerConnection.id,
        provider: providerConnection.provider,
        mode: providerConnection.mode,
        status: providerConnection.status,
        lastEventAt: providerConnection.lastEventAt,
        lastError: providerConnection.lastError,
      })
      .from(providerConnection)
      .orderBy(providerConnection.provider, providerConnection.mode),
  ]);

  const jobCounts = new Map(jobRows.map((row) => [row.status, Number(row.total)]));
  const commissionCounts = new Map(commissionRows.map((row) => [row.status, Number(row.total)]));

  return {
    instance: { setupCompletedAt: instanceRow[0]?.setupCompletedAt ?? null },
    worker: {
      lastSeenAt: heartbeatRow[0]?.lastSeenAt ?? null,
      hostname: heartbeatRow[0]?.hostname ?? null,
    },
    jobs: {
      queued: jobCounts.get("queued") ?? 0,
      running: jobCounts.get("running") ?? 0,
      failed: jobCounts.get("failed") ?? 0,
      oldestQueuedAt: oldestQueuedRow[0]?.runAt ?? null,
    },
    commissions: {
      pending: commissionCounts.get("pending") ?? 0,
      approved: commissionCounts.get("approved") ?? 0,
      available: commissionCounts.get("available") ?? 0,
      duePending: Number(duePendingRow[0]?.total ?? 0),
      dueApproved: Number(dueApprovedRow[0]?.total ?? 0),
    },
    email: {
      mode: env.EMAIL_OUTBOX_DIR ? "outbox" : emailRow?.host && emailRow.fromEmail ? "smtp" : "not_configured",
      host: emailRow?.host ?? null,
      fromEmail: emailRow?.fromEmail ?? null,
      lastTestedAt: emailRow?.lastTestedAt ?? null,
      lastTestError: emailRow?.lastTestError ?? null,
      failedDeliveries: Number(failedDeliveryRow[0]?.total ?? 0),
    },
    providers: providerRows,
    checkedAt: now,
  };
}
