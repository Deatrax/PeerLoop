CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"step" text NOT NULL,
	"model" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"output_json" jsonb NOT NULL,
	"latency_ms" integer NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"request_id" text,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"requested_by_type" text NOT NULL,
	"assignee_role" text NOT NULL,
	"assignee_id" text,
	"state" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "auth_links" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"request_class" text NOT NULL,
	"steps" jsonb NOT NULL,
	"quiet_hours" jsonb NOT NULL,
	"grace_period_minutes" integer NOT NULL,
	"locked_by_instructor" boolean NOT NULL,
	"pace_override" double precision NOT NULL,
	"final_action" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone NOT NULL,
	"time_scale" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"url" text,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"origin" text NOT NULL,
	"source_request_id" text,
	"contributor_ids" jsonb NOT NULL,
	"pin_order" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"last_retrieved_at" timestamp with time zone,
	"retrieval_hits" integer NOT NULL,
	"false_positive_count" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"tags" jsonb NOT NULL,
	"published" boolean NOT NULL,
	"previously_verified" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"author_id" text,
	"author_type" text NOT NULL,
	"body_markdown" text NOT NULL,
	"cited_item_ids" jsonb NOT NULL,
	"is_accepted" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"space_id" text NOT NULL,
	"day" text NOT NULL,
	"requests_created" integer NOT NULL,
	"kb_resolved" integer NOT NULL,
	"peer_resolved" integer NOT NULL,
	"cr_resolved" integer NOT NULL,
	"unresolved" integer NOT NULL,
	"median_first_response_minutes" double precision NOT NULL,
	"duplicate_rate" double precision NOT NULL,
	"escalation_rate" double precision NOT NULL,
	CONSTRAINT "metrics_daily_space_id_day_pk" PRIMARY KEY("space_id","day")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"space_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"delivered_channel" text NOT NULL,
	"delivery_state" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "org_memberships" (
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "org_memberships_user_id_org_id_pk" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"tier" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"reason" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "request_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "request_recipients" (
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tier" text NOT NULL,
	"notified_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"score_snapshot" jsonb,
	CONSTRAINT "request_recipients_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body_text" text NOT NULL,
	"normalised_question" text NOT NULL,
	"category" text NOT NULL,
	"request_class" text NOT NULL,
	"priority" text NOT NULL,
	"tags" jsonb NOT NULL,
	"audience_tier" text NOT NULL,
	"state" text NOT NULL,
	"parent_request_id" text,
	"merged_count" integer DEFAULT 1 NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"next_escalation_at" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"responder_ids" jsonb NOT NULL,
	"accepted_answer_id" text,
	"resolved_at" timestamp with time zone,
	"closed_reason" text,
	"contains_personal_info" boolean NOT NULL,
	"needs_review" boolean NOT NULL,
	"skipped_tiers" jsonb NOT NULL,
	"held_reason" text,
	"attempt" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_links" (
	"space_id" text NOT NULL,
	"sibling_space_id" text NOT NULL,
	"relation" text NOT NULL,
	"relay_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "space_links_space_id_sibling_space_id_pk" PRIMARY KEY("space_id","sibling_space_id")
);
--> statement-breakpoint
CREATE TABLE "space_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"helper_score" double precision DEFAULT 0 NOT NULL,
	"verified_helper" boolean DEFAULT false NOT NULL,
	"notified_count_7d" integer NOT NULL,
	"accepted_answers_30d" integer NOT NULL,
	"notified_count_30d" integer NOT NULL,
	"last_active_at" timestamp with time zone NOT NULL,
	"muted_until" timestamp with time zone,
	"lab_group" text NOT NULL,
	"section" text NOT NULL,
	"notification_budget_override" integer,
	"notifications_sent_today" integer NOT NULL,
	"accepted_tags" jsonb NOT NULL,
	"status" text NOT NULL,
	"creation_muted_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"term" text NOT NULL,
	"section" text NOT NULL,
	"color_token" text NOT NULL,
	"join_code" text NOT NULL,
	"allow_sibling_relay" boolean NOT NULL,
	"agent_enabled" boolean DEFAULT true NOT NULL,
	"pace_override" double precision DEFAULT 1 NOT NULL,
	"policy_locked" boolean NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "spaces_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_initials" text NOT NULL,
	"active_space_id" text,
	"push_tokens" jsonb NOT NULL,
	"preferences" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_student_id_unique" UNIQUE("student_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_policies" ADD CONSTRAINT "escalation_policies_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_request_id_requests_id_fk" FOREIGN KEY ("source_request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD CONSTRAINT "metrics_daily_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_recipients" ADD CONSTRAINT "request_recipients_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_recipients" ADD CONSTRAINT "request_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_links" ADD CONSTRAINT "space_links_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_links" ADD CONSTRAINT "space_links_sibling_space_id_spaces_id_fk" FOREIGN KEY ("sibling_space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_memberships" ADD CONSTRAINT "space_memberships_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_memberships" ADD CONSTRAINT "space_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "policy_unique" ON "escalation_policies" USING btree ("space_id","request_class");--> statement-breakpoint
CREATE INDEX "recipient_user_idx" ON "request_recipients" USING btree ("user_id","notified_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_due_idx" ON "requests" USING btree ("next_escalation_at") WHERE "requests"."state" in ('ROUTED','ESCALATED');--> statement-breakpoint
CREATE INDEX "requests_space_idx" ON "requests" USING btree ("space_id","state","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_author_idx" ON "requests" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "membership_unique" ON "space_memberships" USING btree ("space_id","user_id");