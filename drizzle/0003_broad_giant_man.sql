CREATE TABLE "affiliate" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"website_url" text,
	"country" text,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"promotion_plan" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"referral_code" text,
	"commission_override_bps" integer,
	"notes" text DEFAULT '' NOT NULL,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "affiliate_referral_code_unique" UNIQUE("referral_code"),
	CONSTRAINT "affiliate_override_check" CHECK ("affiliate"."commission_override_bps" is null or "affiliate"."commission_override_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "affiliate_application" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"website_url" text NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"promotion_plan" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"question_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terms_version" integer DEFAULT 1 NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_application_channels_check" CHECK (jsonb_typeof("affiliate_application"."channels") = 'array')
);
--> statement-breakpoint
ALTER TABLE "affiliate" ADD CONSTRAINT "affiliate_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_application" ADD CONSTRAINT "affiliate_application_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_application" ADD CONSTRAINT "affiliate_application_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_status_idx" ON "affiliate" USING btree ("status");--> statement-breakpoint
CREATE INDEX "affiliate_application_status_idx" ON "affiliate_application" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_application_one_pending_idx" ON "affiliate_application" USING btree ("affiliate_id") WHERE "affiliate_application"."status" = 'pending';