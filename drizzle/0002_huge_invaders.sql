CREATE TYPE "public"."supplier_sync_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."supplier_sync_job_type" AS ENUM('all', 'changes');--> statement-breakpoint
CREATE TABLE "supplier_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" "supplier_sync_job_type" NOT NULL,
	"status" "supplier_sync_job_status" DEFAULT 'queued' NOT NULL,
	"date_from" date,
	"date_to" date,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"github_run_id" text,
	"github_run_url" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_sync_jobs" ADD CONSTRAINT "supplier_sync_jobs_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_sync_jobs" ADD CONSTRAINT "supplier_sync_jobs_actor_id_user_profiles_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_sync_jobs_supplier_requested_idx" ON "supplier_sync_jobs" USING btree ("supplier_id","requested_at");--> statement-breakpoint
CREATE INDEX "supplier_sync_jobs_status_idx" ON "supplier_sync_jobs" USING btree ("status","requested_at");