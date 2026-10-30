/**
 * Background worker: matures commissions and delivers queued email.
 *
 * Run continuously in Docker, or once with WORKER_ONCE=1 (used by E2E tests).
 */
import { and, eq, lt, lte, sql } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { job, notification, rateLimit, user, workerHeartbeat } from "../src/lib/db/schema";
import { matureCommissions } from "../src/features/commissions/server/lifecycle";
import { layout, sendEmail } from "../src/lib/email";
import { env } from "../src/lib/env";

const POLL_INTERVAL_MS = 5_000;
const CLAIM_BATCH = 10;
const STALE_JOB_MS = 10 * 60_000;
const RATE_LIMIT_TTL_MS = 24 * 60 * 60_000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 10 * 60_000;
const workerId = `${process.env.HOSTNAME ?? "worker"}-${process.pid}`;
const once = process.env.WORKER_ONCE === "1";
let lastRateLimitCleanup = 0;

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

console.log(`Worker started (${workerId}).`);

do {
  try {
    await heartbeat();
    const maturity = await matureCommissions();
    if (maturity.approved || maturity.available) {
      console.log(`Matured commissions: approved=${maturity.approved} available=${maturity.available}`);
    }
    await releaseStaleJobs();
    await pruneRateLimits();
    await runJobs();
  } catch (error) {
    console.error("Worker cycle failed:", error instanceof Error ? error.message : error);
  }
  if (!once) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
} while (!stopping && !once);

await db.$sql.end();
console.log("Worker stopped.");

async function heartbeat(): Promise<void> {
  await db
    .insert(workerHeartbeat)
    .values({ id: workerId, hostname: process.env.HOSTNAME ?? "worker" })
    .onConflictDoUpdate({
      target: workerHeartbeat.id,
      set: { hostname: process.env.HOSTNAME ?? "worker", lastSeenAt: new Date() },
    });
}

async function releaseStaleJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  await db
    .update(job)
    .set({ status: "queued", lockedAt: null, lockedBy: null, runAt: new Date() })
    .where(and(eq(job.status, "running"), lte(job.lockedAt, cutoff)));
}

/** Fixed-window buckets are disposable; without pruning the table grows forever. */
async function pruneRateLimits(): Promise<void> {
  const now = Date.now();
  if (now - lastRateLimitCleanup < RATE_LIMIT_CLEANUP_INTERVAL_MS) return;
  lastRateLimitCleanup = now;
  await db.delete(rateLimit).where(lt(rateLimit.lastRequest, now - RATE_LIMIT_TTL_MS));
}

async function runJobs(): Promise<void> {
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(job)
      .where(and(eq(job.status, "queued"), lte(job.runAt, new Date())))
      .orderBy(job.runAt)
      .limit(CLAIM_BATCH)
      .for("update", { skipLocked: true });

    for (const row of rows) {
      await tx
        .update(job)
        .set({ status: "running", lockedAt: new Date(), lockedBy: workerId, attempts: sql`${job.attempts} + 1` })
        .where(and(eq(job.id, row.id), eq(job.status, "queued")));
    }
    return rows;
  });

  for (const row of claimed) await runJob(row);
}

async function runJob(row: typeof job.$inferSelect): Promise<void> {
  try {
    if (row.type === "notification_email") {
      await deliverNotificationEmail(row.payload.notificationId);
    } else if (row.type === "send_email") {
      await deliverDirectEmail(row.payload);
    } else {
      throw new Error(`Unknown job type: ${row.type}`);
    }
    await db.update(job).set({ status: "succeeded", completedAt: new Date(), lastError: null }).where(eq(job.id, row.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown job error";
    const finalAttempt = row.attempts + 1 >= row.maxAttempts;
    const delay = Math.min(60 * 60_000, 2 ** row.attempts * 5_000) + Math.floor(Math.random() * 5_000);
    console.error(`[job:${row.type}] failed: ${message}`);
    await db
      .update(job)
      .set({
        status: finalAttempt ? "failed" : "queued",
        runAt: finalAttempt ? row.runAt : new Date(Date.now() + delay),
        lockedAt: null,
        lockedBy: null,
        lastError: message.slice(0, 2000),
        completedAt: finalAttempt ? new Date() : null,
      })
      .where(eq(job.id, row.id));
  }
}

async function deliverNotificationEmail(notificationId: unknown): Promise<void> {
  if (typeof notificationId !== "string") throw new Error("notification_email is missing notificationId.");
  const [row] = await db
    .select({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      emailStatus: notification.emailStatus,
      emailAttempts: notification.emailAttempts,
      email: user.email,
    })
    .from(notification)
    .innerJoin(user, eq(notification.userId, user.id))
    .where(eq(notification.id, notificationId))
    .limit(1);
  if (!row) throw new Error("Notification not found.");
  if (row.emailStatus === "sent") return;

  const result = await sendEmail({
    to: row.email,
    subject: row.title,
    html: layout(
      row.title,
      `<p>${escapeHtml(row.body)}</p>${row.href ? `<p><a href="${env.APP_URL}${row.href}">Open TakeSlice</a></p>` : ""}`,
      env.APP_URL,
    ),
    text: `${row.title}\n\n${row.body}${row.href ? `\n\n${env.APP_URL}${row.href}` : ""}`,
  });
  await markEmail(row.id, result.status, row.emailAttempts, result.status === "failed" ? result.error : undefined);
  if (result.status === "failed") throw new Error(result.error);
}

async function deliverDirectEmail(payload: Record<string, unknown>): Promise<void> {
  if (typeof payload.to !== "string" || typeof payload.subject !== "string" || typeof payload.title !== "string") {
    throw new Error("send_email is missing to, subject or title.");
  }
  const body = typeof payload.body === "string" ? payload.body : "";
  const href = typeof payload.href === "string" ? payload.href : null;
  const result = await sendEmail({
    to: payload.to,
    subject: payload.subject,
    html: layout(payload.title, body, env.APP_URL),
    text: `${payload.title}\n\n${stripTags(body)}${href ? `\n\n${env.APP_URL}${href}` : ""}`,
  });
  if (result.status === "failed") throw new Error(result.error);
}

async function markEmail(
  notificationId: string,
  status: "sent" | "outbox" | "not_configured" | "failed",
  attempts: number,
  error?: string,
): Promise<void> {
  await db
    .update(notification)
    .set({
      emailStatus: status === "sent" || status === "outbox" ? "sent" : status === "not_configured" ? "skipped" : "failed",
      emailAttempts: attempts + 1,
      emailError: error ?? null,
    })
    .where(eq(notification.id, notificationId));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[character] ?? character;
  });
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}
