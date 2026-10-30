import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { conversion } from "./tracking";

/**
 * One connection per provider and mode. Credentials and signing secrets are AES-GCM
 * encrypted by the service layer; only a short hint is ever read for display.
 */
export const providerConnection = pgTable(
  "provider_connection",
  {
    id: text("id").primaryKey(),
    provider: text("provider", {
      enum: ["stripe", "paddle", "lemonsqueezy", "dodo", "polar", "revenuecat", "shopify", "woocommerce"],
    }).notNull(),
    mode: text("mode", { enum: ["live", "test"] }).notNull(),
    status: text("status", { enum: ["pending", "active", "disconnected"] }).notNull().default("pending"),
    credentialsEncrypted: text("credentials_encrypted").notNull(),
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    credentialHint: text("credential_hint"),
    remoteWebhookId: text("remote_webhook_id"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("provider_connection_provider_mode_idx").on(table.provider, table.mode),
    index("provider_connection_status_idx").on(table.status),
    check("provider_connection_provider_check", sql`${table.provider} in ('stripe', 'paddle', 'lemonsqueezy', 'dodo', 'polar', 'revenuecat', 'shopify', 'woocommerce')`),
    check("provider_connection_mode_check", sql`${table.mode} in ('live', 'test')`),
    check("provider_connection_status_check", sql`${table.status} in ('pending', 'active', 'disconnected')`),
  ],
);

/** Append-only delivery log. The provider event ID makes redelivery a no-op. */
export const providerEvent = pgTable(
  "provider_event",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => providerConnection.id, { onDelete: "cascade" }),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type"),
    outcome: text("outcome", { enum: ["processing", "processed", "duplicate", "ignored", "deferred"] }).notNull(),
    conversionId: text("conversion_id").references(() => conversion.id, { onDelete: "set null" }),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("provider_event_connection_event_idx").on(table.connectionId, table.providerEventId),
    index("provider_event_connection_time_idx").on(table.connectionId, table.receivedAt),
    index("provider_event_outcome_idx").on(table.outcome),
    check("provider_event_outcome_check", sql`${table.outcome} in ('processing', 'processed', 'duplicate', 'ignored', 'deferred')`),
  ],
);
