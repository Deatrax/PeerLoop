CREATE TABLE "job_leases" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "requests_due_idx";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "requests_due_idx" ON "requests" USING btree ("next_escalation_at") WHERE "requests"."state" in ('ROUTED','ESCALATED','IN_PROGRESS');