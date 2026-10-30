CREATE TABLE "custom_question" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"original_name" text NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "instance" DROP CONSTRAINT "instance_singleton_check";--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_question_position_idx" ON "custom_question" USING btree ("position");--> statement-breakpoint
ALTER TABLE "program_settings" ADD CONSTRAINT "program_settings_logo_upload_id_upload_id_fk" FOREIGN KEY ("logo_upload_id") REFERENCES "public"."upload"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_singleton_check" CHECK ("instance"."id" = 'default');