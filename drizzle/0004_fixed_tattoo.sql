CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_prefix_unique" UNIQUE("prefix"),
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "click" (
	"id" text PRIMARY KEY NOT NULL,
	"link_id" text,
	"affiliate_id" text,
	"mode" text DEFAULT 'live' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"country" char(2),
	"referrer_host" text,
	"user_agent" text,
	"sub" text,
	"landing_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"provider_connection_id" text,
	"mode" text DEFAULT 'live' NOT NULL,
	"event" text DEFAULT 'purchase' NOT NULL,
	"external_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"click_id" text,
	"affiliate_id" text,
	"attributed_via" text DEFAULT 'none' NOT NULL,
	"attribution_outcome" text NOT NULL,
	"coupon_code" text,
	"subscription_ref" text,
	"renewal" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversion_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "conversion_amount_check" CHECK ("conversion"."amount_minor" >= 0),
	CONSTRAINT "conversion_currency_check" CHECK ("conversion"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "coupon" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"code" text NOT NULL,
	"discount_text" text,
	"status" text DEFAULT 'active' NOT NULL,
	"provider_connection_id" text,
	"remote_coupon_id" text,
	"sync_status" text DEFAULT 'not_synced' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_code_unique" UNIQUE("code"),
	CONSTRAINT "coupon_code_check" CHECK ("coupon"."code" ~ '^[A-Za-z0-9_-]{3,64}$')
);
--> statement-breakpoint
CREATE TABLE "referral_link" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"code" text NOT NULL,
	"destination_url" text NOT NULL,
	"label" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"sub" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_link_code_unique" UNIQUE("code"),
	CONSTRAINT "referral_link_code_check" CHECK ("referral_link"."code" ~ '^[a-z0-9]{4,32}$')
);
--> statement-breakpoint
CREATE TABLE "subscription_link" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_ref" text NOT NULL,
	"mode" text NOT NULL,
	"conversion_id" text,
	"affiliate_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click" ADD CONSTRAINT "click_link_id_referral_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."referral_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click" ADD CONSTRAINT "click_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_click_id_click_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."click"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_link" ADD CONSTRAINT "referral_link_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_link" ADD CONSTRAINT "subscription_link_conversion_id_conversion_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_link" ADD CONSTRAINT "subscription_link_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_mode_idx" ON "api_key" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "click_affiliate_time_idx" ON "click" USING btree ("affiliate_id","occurred_at");--> statement-breakpoint
CREATE INDEX "click_time_idx" ON "click" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "conversion_affiliate_time_idx" ON "conversion" USING btree ("affiliate_id","occurred_at");--> statement-breakpoint
CREATE INDEX "conversion_time_idx" ON "conversion" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "conversion_outcome_idx" ON "conversion" USING btree ("attribution_outcome");--> statement-breakpoint
CREATE INDEX "coupon_affiliate_idx" ON "coupon" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "referral_link_affiliate_idx" ON "referral_link" USING btree ("affiliate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_link_one_default_idx" ON "referral_link" USING btree ("affiliate_id") WHERE "referral_link"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_link_ref_mode_idx" ON "subscription_link" USING btree ("subscription_ref","mode");