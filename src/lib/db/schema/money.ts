import { sql } from "drizzle-orm";
import { boolean, char, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { affiliate } from "./affiliates";
import { conversion } from "./tracking";

/**
 * The payable record for one attributed conversion. `originalAmountMinor` is
 * frozen at creation; `amountMinor` is reduced by refunds before payout. Status
 * changes and every refund are recorded in append-only history tables.
 */
export const commission = pgTable(
  "commission",
  {
    id: text("id").primaryKey(),
    conversionId: text("conversion_id")
      .notNull()
      .unique()
      .references(() => conversion.id, { onDelete: "restrict" }),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliate.id, { onDelete: "restrict" }),
    mode: text("mode", { enum: ["live", "test"] }).notNull(),
    status: text("status", { enum: ["pending", "approved", "available", "paid", "declined", "reversed"] }).notNull().default("pending"),
    originalAmountMinor: integer("original_amount_minor").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    saleAmountMinor: integer("sale_amount_minor").notNull(),
    refundedSaleAmountMinor: integer("refunded_sale_amount_minor").notNull().default(0),
    currency: char("currency", { length: 3 }).notNull(),
    rateType: text("rate_type", { enum: ["percent", "fixed"] }).notNull(),
    rateBps: integer("rate_bps"),
    rateFixedMinor: integer("rate_fixed_minor"),
    rateSource: text("rate_source", { enum: ["program", "override"] }).notNull(),
    /** True when the conversion is a subscription renewal rather than the first payment. */
    recurring: boolean("recurring").notNull().default(false),
    validationEndsAt: timestamp("validation_ends_at", { withTimezone: true }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("commission_affiliate_status_idx").on(table.affiliateId, table.status),
    index("commission_status_validation_idx").on(table.status, table.validationEndsAt),
    index("commission_status_available_idx").on(table.status, table.availableAt),
    index("commission_mode_status_idx").on(table.mode, table.status),
    index("commission_created_idx").on(table.createdAt),
    check("commission_mode_check", sql`${table.mode} in ('live', 'test')`),
    check(
      "commission_status_check",
      sql`${table.status} in ('pending', 'approved', 'available', 'paid', 'declined', 'reversed')`,
    ),
    check("commission_original_amount_check", sql`${table.originalAmountMinor} >= 0`),
    check("commission_amount_check", sql`${table.amountMinor} >= 0 and ${table.amountMinor} <= ${table.saleAmountMinor}`),
    check("commission_original_amount_check_limit", sql`${table.originalAmountMinor} <= ${table.saleAmountMinor}`),
    check("commission_sale_amount_check", sql`${table.saleAmountMinor} >= 0`),
    check("commission_refunded_sale_amount_check", sql`${table.refundedSaleAmountMinor} between 0 and ${table.saleAmountMinor}`),
    check("commission_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("commission_rate_check", sql`
      (${table.rateType} = 'percent' and ${table.rateBps} between 0 and 10000 and ${table.rateFixedMinor} is null)
      or (${table.rateType} = 'fixed' and ${table.rateFixedMinor} > 0 and ${table.rateBps} is null)
    `),
    check("commission_rate_source_check", sql`${table.rateSource} in ('program', 'override')`),
  ],
);

/** Append-only status history. The commission row holds the current state. */
export const commissionEvent = pgTable(
  "commission_event",
  {
    id: text("id").primaryKey(),
    commissionId: text("commission_id")
      .notNull()
      .references(() => commission.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("commission_event_commission_time_idx").on(table.commissionId, table.createdAt)],
);

/** One provider or API refund. `refundKey` makes redelivery a no-op. */
export const refundApplication = pgTable(
  "refund_application",
  {
    id: text("id").primaryKey(),
    commissionId: text("commission_id")
      .notNull()
      .references(() => commission.id, { onDelete: "restrict" }),
    refundKey: text("refund_key").notNull().unique(),
    kind: text("kind", { enum: ["refund", "chargeback"] }).notNull().default("refund"),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("refund_application_commission_idx").on(table.commissionId),
    check("refund_application_amount_check", sql`${table.amountMinor} > 0`),
    check("refund_application_kind_check", sql`${table.kind} in ('refund', 'chargeback')`),
    check("refund_application_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/** Signed adjustment. Positive credits and negative corrections both use this table. */
export const adjustment = pgTable(
  "adjustment",
  {
    id: text("id").primaryKey(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliate.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["active", "void"] }).notNull().default("active"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("adjustment_affiliate_status_idx").on(table.affiliateId, table.status),
    check("adjustment_amount_check", sql`${table.amountMinor} <> 0`),
    check("adjustment_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("adjustment_status_check", sql`${table.status} in ('active', 'void')`),
  ],
);

/** An externally paid payout. TakeSlice records it; it never moves money itself. */
export const payout = pgTable(
  "payout",
  {
    id: text("id").primaryKey(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliate.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    method: text("method").notNull(),
    detailsSnapshotEncrypted: text("details_snapshot_encrypted"),
    reference: text("reference"),
    note: text("note"),
    status: text("status", { enum: ["pending", "paid", "failed", "cancelled"] }).notNull().default("pending"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("payout_affiliate_time_idx").on(table.affiliateId, table.createdAt),
    index("payout_status_time_idx").on(table.status, table.createdAt),
    check("payout_amount_check", sql`${table.amountMinor} > 0`),
    check("payout_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("payout_status_check", sql`${table.status} in ('pending', 'paid', 'failed', 'cancelled')`),
  ],
);

/** A payout locks the selected commission or adjustment so it cannot be paid twice. */
export const payoutItem = pgTable(
  "payout_item",
  {
    id: text("id").primaryKey(),
    payoutId: text("payout_id")
      .notNull()
      .references(() => payout.id, { onDelete: "cascade" }),
    commissionId: text("commission_id").references(() => commission.id, { onDelete: "restrict" }),
    adjustmentId: text("adjustment_id").references(() => adjustment.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payout_item_payout_idx").on(table.payoutId),
    uniqueIndex("payout_item_commission_idx").on(table.commissionId).where(sql`${table.commissionId} is not null`),
    uniqueIndex("payout_item_adjustment_idx").on(table.adjustmentId).where(sql`${table.adjustmentId} is not null`),
    check("payout_item_amount_check", sql`${table.amountMinor} <> 0`),
    check(
      "payout_item_one_source_check",
      sql`((${table.commissionId} is not null)::int + (${table.adjustmentId} is not null)::int) = 1`,
    ),
  ],
);

/**
 * Append-only audit ledger. It is not the source of the affiliate balance; the
 * commission and adjustment rows are. Entries are posted only for live money.
 */
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: text("id").primaryKey(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliate.id, { onDelete: "restrict" }),
    dedupeKey: text("dedupe_key").notNull().unique(),
    kind: text("kind").notNull(),
    refType: text("ref_type").notNull(),
    refId: text("ref_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ledger_entry_affiliate_time_idx").on(table.affiliateId, table.createdAt),
    index("ledger_entry_ref_idx").on(table.refType, table.refId),
    check("ledger_entry_amount_check", sql`${table.amountMinor} <> 0`),
    check("ledger_entry_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);
