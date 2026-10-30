import { sql } from "drizzle-orm";
import { boolean, check, char, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** One row. Existence plus `setup_completed_at` decides whether the wizard is open. */
export const instance = pgTable(
  "instance",
  {
    id: text("id").primaryKey().default("default"),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    setupTokenHash: text("setup_token_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [check("instance_singleton_check", sql`${table.id} = 'default'`)],
);

/** Re-encoded raster uploads. The storage key is random and never derived from the filename. */
export const upload = pgTable("upload", {
  id: text("id").primaryKey(),
  storageKey: text("storage_key").notNull().unique(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  originalName: text("original_name").notNull(),
  /** Public uploads (logos) are served without a session; private ones require an admin. */
  visibility: text("visibility", { enum: ["public", "private"] }).notNull().default("private"),
  uploadedByUserId: text("uploaded_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Program-wide rules. Edited from the admin dashboard. */
export const programSettings = pgTable(
  "program_settings",
  {
    id: text("id").primaryKey().default("default"),
    businessName: text("business_name").notNull(),
    websiteUrl: text("website_url").notNull(),
    programName: text("program_name").notNull(),
    programSlug: text("program_slug").notNull(),
    description: text("description").notNull().default(""),
    terms: text("terms").notNull().default(""),
    termsVersion: integer("terms_version").notNull().default(1),
    supportEmail: text("support_email"),
    currency: char("currency", { length: 3 }).notNull(),
    rateType: text("rate_type", { enum: ["percent", "fixed"] }).notNull().default("percent"),
    commissionBps: integer("commission_bps").notNull().default(2000),
    commissionFixedMinor: integer("commission_fixed_minor"),
    attributionDays: integer("attribution_days").notNull().default(30),
    validationDays: integer("validation_days").notNull().default(30),
    holdingDays: integer("holding_days").notNull().default(0),
    recurringMode: text("recurring_mode", { enum: ["first_payment", "months", "lifetime"] }).notNull().default("first_payment"),
    recurringMonths: integer("recurring_months"),
    approvalMode: text("approval_mode", { enum: ["manual", "auto"] }).notNull().default("manual"),
    couponMode: text("coupon_mode", { enum: ["disabled", "manual", "auto"] }).notNull().default("manual"),
    /** Which signal wins when a conversion carries both a valid click and a coupon. */
    attributionConflict: text("attribution_conflict", { enum: ["click", "coupon"] }).notNull().default("click"),
    minimumPayoutMinor: integer("minimum_payout_minor").notNull().default(5000),
    brandColor: text("brand_color").notNull().default("#3187ee"),
    logoUploadId: text("logo_upload_id").references(() => upload.id, { onDelete: "set null" }),
    hideBranding: boolean("hide_branding").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("program_settings_singleton_check", sql`${table.id} = 'default'`),
    check("program_settings_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("program_settings_rate_check", sql`
      (${table.rateType} = 'percent' and ${table.commissionBps} between 0 and 10000 and ${table.commissionFixedMinor} is null)
      or (${table.rateType} = 'fixed' and ${table.commissionFixedMinor} > 0)
    `),
    check("program_settings_days_check", sql`
      ${table.attributionDays} between 0 and 365
      and ${table.validationDays} between 0 and 67
      and ${table.holdingDays} between 0 and 365
    `),
  ],
);

export const emailSettings = pgTable(
  "email_settings",
  {
    id: text("id").primaryKey().default("default"),
    host: text("host"),
    port: integer("port").notNull().default(465),
    secure: boolean("secure").notNull().default(true),
    username: text("username"),
    passwordEncrypted: text("password_encrypted"),
    fromName: text("from_name").notNull().default("TakeSlice"),
    fromEmail: text("from_email").notNull(),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestError: text("last_test_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [check("email_settings_singleton_check", sql`${table.id} = 'default'`)],
);

/** Questions asked on the public affiliate application. Order is explicit, not insertion order. */
export const customQuestion = pgTable(
  "custom_question",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    type: text("type", { enum: ["text", "textarea", "select", "checkbox"] }).notNull(),
    required: boolean("required").notNull().default(false),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("custom_question_position_idx").on(table.position)],
);

/** Append-only trail for consequential admin actions. */
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
