CREATE TABLE "adjustment" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjustment_amount_check" CHECK ("adjustment"."amount_minor" <> 0),
	CONSTRAINT "adjustment_currency_check" CHECK ("adjustment"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "adjustment_status_check" CHECK ("adjustment"."status" in ('active', 'void'))
);
--> statement-breakpoint
CREATE TABLE "commission" (
	"id" text PRIMARY KEY NOT NULL,
	"conversion_id" text NOT NULL,
	"affiliate_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_amount_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"sale_amount_minor" integer NOT NULL,
	"refunded_sale_amount_minor" integer DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"rate_type" text NOT NULL,
	"rate_bps" integer,
	"rate_fixed_minor" integer,
	"rate_source" text NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"validation_ends_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_conversion_id_unique" UNIQUE("conversion_id"),
	CONSTRAINT "commission_mode_check" CHECK ("commission"."mode" in ('live', 'test')),
	CONSTRAINT "commission_status_check" CHECK ("commission"."status" in ('pending', 'approved', 'available', 'paid', 'declined', 'reversed')),
	CONSTRAINT "commission_original_amount_check" CHECK ("commission"."original_amount_minor" >= 0),
	CONSTRAINT "commission_amount_check" CHECK ("commission"."amount_minor" >= 0),
	CONSTRAINT "commission_sale_amount_check" CHECK ("commission"."sale_amount_minor" >= 0),
	CONSTRAINT "commission_refunded_sale_amount_check" CHECK ("commission"."refunded_sale_amount_minor" between 0 and "commission"."sale_amount_minor"),
	CONSTRAINT "commission_currency_check" CHECK ("commission"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "commission_rate_check" CHECK (
      ("commission"."rate_type" = 'percent' and "commission"."rate_bps" between 0 and 10000 and "commission"."rate_fixed_minor" is null)
      or ("commission"."rate_type" = 'fixed' and "commission"."rate_fixed_minor" > 0 and "commission"."rate_bps" is null)
    ),
	CONSTRAINT "commission_rate_source_check" CHECK ("commission"."rate_source" in ('program', 'override'))
);
--> statement-breakpoint
CREATE TABLE "commission_event" (
	"id" text PRIMARY KEY NOT NULL,
	"commission_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_user_id" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entry_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "ledger_entry_amount_check" CHECK ("ledger_entry"."amount_minor" <> 0),
	CONSTRAINT "ledger_entry_currency_check" CHECK ("ledger_entry"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "payout" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"method" text NOT NULL,
	"details_snapshot_encrypted" text,
	"reference" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by_user_id" text,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_amount_check" CHECK ("payout"."amount_minor" > 0),
	CONSTRAINT "payout_currency_check" CHECK ("payout"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payout_status_check" CHECK ("payout"."status" in ('pending', 'paid', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "payout_item" (
	"id" text PRIMARY KEY NOT NULL,
	"payout_id" text NOT NULL,
	"commission_id" text,
	"adjustment_id" text,
	"amount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_item_amount_check" CHECK ("payout_item"."amount_minor" <> 0),
	CONSTRAINT "payout_item_one_source_check" CHECK ((("payout_item"."commission_id" is not null)::int + ("payout_item"."adjustment_id" is not null)::int) = 1)
);
--> statement-breakpoint
CREATE TABLE "refund_application" (
	"id" text PRIMARY KEY NOT NULL,
	"commission_id" text NOT NULL,
	"refund_key" text NOT NULL,
	"kind" text DEFAULT 'refund' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_application_refund_key_unique" UNIQUE("refund_key"),
	CONSTRAINT "refund_application_amount_check" CHECK ("refund_application"."amount_minor" > 0),
	CONSTRAINT "refund_application_kind_check" CHECK ("refund_application"."kind" in ('refund', 'chargeback')),
	CONSTRAINT "refund_application_currency_check" CHECK ("refund_application"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_attempts_check" CHECK ("job"."attempts" >= 0 and "job"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"email_status" text DEFAULT 'not_queued' NOT NULL,
	"email_attempts" integer DEFAULT 0 NOT NULL,
	"email_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate" ADD COLUMN "kind" text DEFAULT 'partner' NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "affiliate" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "affiliate" ADD COLUMN "payout_method" text;--> statement-breakpoint
ALTER TABLE "affiliate" ADD COLUMN "payout_details_encrypted" text;--> statement-breakpoint
ALTER TABLE "affiliate" ADD COLUMN "payout_details_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversion" ADD COLUMN "provider_payment_ref" text;--> statement-breakpoint
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission" ADD CONSTRAINT "commission_conversion_id_conversion_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission" ADD CONSTRAINT "commission_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_event" ADD CONSTRAINT "commission_event_commission_id_commission_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."commission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_event" ADD CONSTRAINT "commission_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_payout_id_payout_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_commission_id_commission_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."commission"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_adjustment_id_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."adjustment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_application" ADD CONSTRAINT "refund_application_commission_id_commission_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."commission"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adjustment_affiliate_status_idx" ON "adjustment" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "commission_affiliate_status_idx" ON "commission" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "commission_status_validation_idx" ON "commission" USING btree ("status","validation_ends_at");--> statement-breakpoint
CREATE INDEX "commission_status_available_idx" ON "commission" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "commission_mode_status_idx" ON "commission" USING btree ("mode","status");--> statement-breakpoint
CREATE INDEX "commission_created_idx" ON "commission" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "commission_event_commission_time_idx" ON "commission_event" USING btree ("commission_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entry_affiliate_time_idx" ON "ledger_entry" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entry_ref_idx" ON "ledger_entry" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "payout_affiliate_time_idx" ON "payout" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX "payout_status_time_idx" ON "payout" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payout_item_payout_idx" ON "payout_item" USING btree ("payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_item_commission_idx" ON "payout_item" USING btree ("commission_id") WHERE "payout_item"."commission_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_item_adjustment_idx" ON "payout_item" USING btree ("adjustment_id") WHERE "payout_item"."adjustment_id" is not null;--> statement-breakpoint
CREATE INDEX "refund_application_commission_idx" ON "refund_application" USING btree ("commission_id");--> statement-breakpoint
CREATE INDEX "job_claim_idx" ON "job" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_dedupe_idx" ON "job" USING btree ("dedupe_key") WHERE "job"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "notification_user_time_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_idx" ON "notification" USING btree ("dedupe_key") WHERE "notification"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "affiliate_kind_idx" ON "affiliate" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "conversion_provider_payment_idx" ON "conversion" USING btree ("provider_connection_id","provider_payment_ref");--> statement-breakpoint
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_external_id_unique" UNIQUE("external_id");--> statement-breakpoint
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_kind_check" CHECK ("affiliate"."kind" in ('partner', 'customer'));--> statement-breakpoint
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_identity_check" CHECK (("affiliate"."kind" = 'partner' and "affiliate"."user_id" is not null) or ("affiliate"."kind" = 'customer' and "affiliate"."external_id" is not null));--> statement-breakpoint
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_payout_method_check" CHECK ("affiliate"."payout_method" is null or "affiliate"."payout_method" in ('paypal', 'bank_transfer', 'wise', 'other'));