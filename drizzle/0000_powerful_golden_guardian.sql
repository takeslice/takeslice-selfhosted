CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'affiliate' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('admin', 'affiliate'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"host" text,
	"port" integer DEFAULT 465 NOT NULL,
	"secure" boolean DEFAULT true NOT NULL,
	"username" text,
	"password_encrypted" text,
	"from_name" text DEFAULT 'TakeSlice' NOT NULL,
	"from_email" text NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_settings_singleton_check" CHECK ("email_settings"."id" = 'default')
);
--> statement-breakpoint
CREATE TABLE "instance" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"setup_completed_at" timestamp with time zone,
	"setup_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_singleton_check" CHECK ("id" = 'default')
);
--> statement-breakpoint
CREATE TABLE "program_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"business_name" text NOT NULL,
	"website_url" text NOT NULL,
	"program_name" text NOT NULL,
	"program_slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"terms_version" integer DEFAULT 1 NOT NULL,
	"support_email" text,
	"currency" char(3) NOT NULL,
	"rate_type" text DEFAULT 'percent' NOT NULL,
	"commission_bps" integer DEFAULT 2000 NOT NULL,
	"commission_fixed_minor" integer,
	"attribution_days" integer DEFAULT 30 NOT NULL,
	"validation_days" integer DEFAULT 30 NOT NULL,
	"holding_days" integer DEFAULT 0 NOT NULL,
	"recurring_mode" text DEFAULT 'first_payment' NOT NULL,
	"recurring_months" integer,
	"approval_mode" text DEFAULT 'manual' NOT NULL,
	"coupon_mode" text DEFAULT 'manual' NOT NULL,
	"minimum_payout_minor" integer DEFAULT 5000 NOT NULL,
	"brand_color" text DEFAULT '#3187ee' NOT NULL,
	"logo_upload_id" text,
	"hide_branding" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_settings_singleton_check" CHECK ("program_settings"."id" = 'default'),
	CONSTRAINT "program_settings_currency_check" CHECK ("program_settings"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "program_settings_rate_check" CHECK (
      ("program_settings"."rate_type" = 'percent' and "program_settings"."commission_bps" between 0 and 10000 and "program_settings"."commission_fixed_minor" is null)
      or ("program_settings"."rate_type" = 'fixed' and "program_settings"."commission_fixed_minor" > 0)
    ),
	CONSTRAINT "program_settings_days_check" CHECK (
      "program_settings"."attribution_days" between 0 and 365
      and "program_settings"."validation_days" between 0 and 67
      and "program_settings"."holding_days" between 0 and 365
    )
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");