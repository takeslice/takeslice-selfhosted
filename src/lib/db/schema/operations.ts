import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Durable background work. The worker claims rows with FOR UPDATE SKIP LOCKED. */
export const job = pgTable(
  "job",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text("dedupe_key"),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("job_claim_idx").on(table.status, table.runAt),
    uniqueIndex("job_dedupe_idx").on(table.dedupeKey).where(sql`${table.dedupeKey} is not null`),
    check("job_attempts_check", sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0`),
  ],
);

/**
 * One row per running worker. Upserted on every cycle so the admin diagnostics page can
 * distinguish "nothing to do" from "the worker is not running".
 */
export const workerHeartbeat = pgTable(
  "worker_heartbeat",
  {
    id: text("id").primaryKey(),
    hostname: text("hostname").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("worker_heartbeat_last_seen_idx").on(table.lastSeenAt)],
);

/** In-app notice and the queue marker for its email. */
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    category: text("category").notNull().default("general"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailStatus: text("email_status", { enum: ["not_queued", "queued", "sent", "failed", "skipped"] }).notNull().default("not_queued"),
    emailAttempts: integer("email_attempts").notNull().default(0),
    emailError: text("email_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notification_user_time_idx").on(table.userId, table.createdAt),
    uniqueIndex("notification_dedupe_idx").on(table.dedupeKey).where(sql`${table.dedupeKey} is not null`),
  ],
);
