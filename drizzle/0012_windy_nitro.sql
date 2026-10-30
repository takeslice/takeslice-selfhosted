CREATE TABLE "worker_heartbeat" (
	"id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "worker_heartbeat_last_seen_idx" ON "worker_heartbeat" USING btree ("last_seen_at");