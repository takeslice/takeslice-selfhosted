import { sql } from "drizzle-orm";
import { boolean, char, check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { affiliate } from "./affiliates";
import { providerConnection } from "./providers";

/** Affiliate-owned destination links. The default link mirrors the affiliate's referral code. */
export const referralLink = pgTable(
  "referral_link",
  {
    id: text("id").primaryKey(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliate.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    destinationUrl: text("destination_url").notNull(),
    label: text("label"),
    isDefault: boolean("is_default").notNull().default(false),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    sub: text("sub"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("referral_link_affiliate_idx").on(table.affiliateId),
    uniqueIndex("referral_link_one_default_idx").on(table.affiliateId).where(sql`${table.isDefault}`),
    check("referral_link_code_check", sql`${table.code} ~ '^[a-z0-9]{4,32}$'`),
  ],
);

/**
 * Codes used for coupon attribution. When a discount percentage is set and a live
 * Stripe connection exists, the code is also created as a Stripe promotion code.
 */
export const coupon = pgTable(
  "coupon",
  {
    id: text("id").primaryKey(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliate.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    discountText: text("discount_text"),
    discountPercent: integer("discount_percent"),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    providerConnectionId: text("provider_connection_id").references(() => providerConnection.id, { onDelete: "set null" }),
    remoteCouponId: text("remote_coupon_id"),
    remotePromotionId: text("remote_promotion_id"),
    syncStatus: text("sync_status", { enum: ["not_synced", "synced", "error"] }).notNull().default("not_synced"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("coupon_affiliate_idx").on(table.affiliateId),
    check("coupon_code_check", sql`${table.code} ~ '^[A-Za-z0-9_-]{3,64}$'`),
    check("coupon_discount_percent_check", sql`${table.discountPercent} is null or (${table.discountPercent} >= 1 and ${table.discountPercent} <= 100)`),
  ],
);

/** Append-only. One row per tracked visit. IPs are stored only as keyed hashes. */
export const click = pgTable(
  "click",
  {
    id: text("id").primaryKey(),
    linkId: text("link_id").references(() => referralLink.id, { onDelete: "set null" }),
    affiliateId: text("affiliate_id").references(() => affiliate.id, { onDelete: "set null" }),
    mode: text("mode", { enum: ["live", "test"] }).notNull().default("live"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ipHash: text("ip_hash"),
    country: char("country", { length: 2 }),
    referrerHost: text("referrer_host"),
    userAgent: text("user_agent"),
    sub: text("sub"),
    landingUrl: text("landing_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("click_affiliate_time_idx").on(table.affiliateId, table.occurredAt),
    index("click_time_idx").on(table.occurredAt),
  ],
);

/** Append-only conversion fact. Attribution is decided once and never rewritten. */
export const conversion = pgTable(
  "conversion",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: ["webhook", "api", "manual"] }).notNull(),
    providerConnectionId: text("provider_connection_id").references(() => providerConnection.id, { onDelete: "set null" }),
    mode: text("mode", { enum: ["live", "test"] }).notNull().default("live"),
    event: text("event").notNull().default("purchase"),
    externalId: text("external_id").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    clickId: text("click_id").references(() => click.id, { onDelete: "set null" }),
    affiliateId: text("affiliate_id").references(() => affiliate.id, { onDelete: "set null" }),
    attributedVia: text("attributed_via", { enum: ["click", "coupon", "none"] }).notNull().default("none"),
    attributionOutcome: text("attribution_outcome", {
      enum: [
        "attributed",
        "no_click",
        "unknown_click",
        "expired_click",
        "wrong_mode",
        "affiliate_inactive",
        "currency_mismatch",
        "coupon_conflict",
      ],
    }).notNull(),
    couponCode: text("coupon_code"),
    subscriptionRef: text("subscription_ref"),
    renewal: boolean("renewal").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversion_affiliate_time_idx").on(table.affiliateId, table.occurredAt),
    index("conversion_time_idx").on(table.occurredAt),
    index("conversion_outcome_idx").on(table.attributionOutcome),
    check("conversion_amount_check", sql`${table.amountMinor} >= 0`),
    check("conversion_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/** Renewals are credited to whichever affiliate first earned the subscription. */
export const subscriptionLink = pgTable(
  "subscription_link",
  {
    id: text("id").primaryKey(),
    subscriptionRef: text("subscription_ref").notNull(),
    mode: text("mode", { enum: ["live", "test"] }).notNull(),
    conversionId: text("conversion_id").references(() => conversion.id, { onDelete: "set null" }),
    affiliateId: text("affiliate_id").references(() => affiliate.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("subscription_link_ref_mode_idx").on(table.subscriptionRef, table.mode)],
);

/** The full key is shown once. Only its SHA-256 hash and a display prefix are stored. */
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull().unique(),
    keyHash: text("key_hash").notNull().unique(),
    mode: text("mode", { enum: ["live", "test"] }).notNull().default("live"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("api_key_mode_idx").on(table.mode)],
);
