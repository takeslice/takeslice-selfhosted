import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

export type AnswerValue = string | string[] | boolean;

export const affiliate = pgTable(
  "affiliate",
  {
    id: text("id").primaryKey(),
    /** Partners sign in. Customer referrers are created by the business and have no user. */
    userId: text("user_id")
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["partner", "customer"] }).notNull().default("partner"),
    /** Stable business-side identifier for a customer referrer (for example a Stripe customer ID). */
    externalId: text("external_id").unique(),
    contactEmail: text("contact_email"),
    displayName: text("display_name").notNull(),
    websiteUrl: text("website_url"),
    country: text("country"),
    channels: jsonb("channels").$type<string[]>().notNull().default([]),
    promotionPlan: text("promotion_plan").notNull().default(""),
    status: text("status", { enum: ["pending", "approved", "rejected", "suspended"] }).notNull().default("pending"),
    /** Set once approved. Used in /r/{code}; null while pending or rejected. */
    referralCode: text("referral_code").unique(),
    /** Basis points. Overrides the program rate for this affiliate when set. */
    commissionOverrideBps: integer("commission_override_bps"),
    /** Encrypted with the instance key. Never returned in lists or logs. */
    payoutMethod: text("payout_method", { enum: ["paypal", "bank_transfer", "wise", "other"] }),
    payoutDetailsEncrypted: text("payout_details_encrypted"),
    payoutDetailsUpdatedAt: timestamp("payout_details_updated_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspensionReason: text("suspension_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("affiliate_status_idx").on(table.status),
    index("affiliate_kind_idx").on(table.kind),
    check("affiliate_override_check", sql`${table.commissionOverrideBps} is null or ${table.commissionOverrideBps} between 0 and 10000`),
    check("affiliate_kind_check", sql`${table.kind} in ('partner', 'customer')`),
    check(
      "affiliate_identity_check",
      sql`(${table.kind} = 'partner' and ${table.userId} is not null) or (${table.kind} = 'customer' and ${table.externalId} is not null)`,
    ),
    check(
      "affiliate_payout_method_check",
      sql`${table.payoutMethod} is null or ${table.payoutMethod} in ('paypal', 'bank_transfer', 'wise', 'other')`,
    ),
  ],
);

/** One row per application. The newest pending row is the one an admin reviews. */
export const affiliateApplication = pgTable(
  "affiliate_application",
  {
    id: text("id").primaryKey(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliate.id, { onDelete: "cascade" }),
    websiteUrl: text("website_url").notNull(),
    channels: jsonb("channels").$type<string[]>().notNull().default([]),
    promotionPlan: text("promotion_plan").notNull().default(""),
    audience: text("audience").notNull().default(""),
    answers: jsonb("answers").$type<Record<string, AnswerValue>>().notNull().default({}),
    /** Label snapshot so a deleted or renamed question still reads correctly in old applications. */
    questionSnapshot: jsonb("question_snapshot").$type<{ id: string; label: string }[]>().notNull().default([]),
    termsVersion: integer("terms_version").notNull().default(1),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected", "withdrawn"] }).notNull().default("pending"),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("affiliate_application_status_idx").on(table.status),
    uniqueIndex("affiliate_application_one_pending_idx")
      .on(table.affiliateId)
      .where(sql`${table.status} = 'pending'`),
    // Guardrail for the values that reach the public page.
    check("affiliate_application_channels_check", sql`jsonb_typeof(${table.channels}) = 'array'`),
  ],
);
