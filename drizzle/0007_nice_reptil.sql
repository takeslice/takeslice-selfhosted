CREATE TABLE "provider_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"webhook_secret_encrypted" text,
	"credential_hint" text,
	"remote_webhook_id" text,
	"last_event_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_event" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text,
	"outcome" text NOT NULL,
	"conversion_id" text,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "provider_event" ADD CONSTRAINT "provider_event_connection_id_provider_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_event" ADD CONSTRAINT "provider_event_conversion_id_conversion_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connection_provider_mode_idx" ON "provider_connection" USING btree ("provider","mode");--> statement-breakpoint
CREATE INDEX "provider_connection_status_idx" ON "provider_connection" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_event_connection_event_idx" ON "provider_event" USING btree ("connection_id","provider_event_id");--> statement-breakpoint
CREATE INDEX "provider_event_connection_time_idx" ON "provider_event" USING btree ("connection_id","received_at");--> statement-breakpoint
CREATE INDEX "provider_event_outcome_idx" ON "provider_event" USING btree ("outcome");--> statement-breakpoint
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE set null ON UPDATE no action;