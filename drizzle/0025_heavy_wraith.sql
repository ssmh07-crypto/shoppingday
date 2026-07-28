CREATE TABLE "naver_bulk_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "naver_bulk_job_items_status_check" CHECK ("naver_bulk_job_items"."status" in ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "naver_bulk_job_items_attempts_check" CHECK ("naver_bulk_job_items"."attempts" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "naver_bulk_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"total" integer NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"succeeded" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "naver_bulk_jobs_type_check" CHECK ("naver_bulk_jobs"."type" in ('upload_images', 'publish')),
	CONSTRAINT "naver_bulk_jobs_status_check" CHECK ("naver_bulk_jobs"."status" in ('queued', 'running', 'completed', 'partial_failed'))
);
--> statement-breakpoint
ALTER TABLE "naver_bulk_job_items" ADD CONSTRAINT "naver_bulk_job_items_job_id_naver_bulk_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."naver_bulk_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_bulk_job_items" ADD CONSTRAINT "naver_bulk_job_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_bulk_jobs" ADD CONSTRAINT "naver_bulk_jobs_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "naver_bulk_job_items_job_product_uidx" ON "naver_bulk_job_items" USING btree ("job_id","product_id");--> statement-breakpoint
CREATE INDEX "naver_bulk_job_items_claim_idx" ON "naver_bulk_job_items" USING btree ("job_id","status","available_at");--> statement-breakpoint
CREATE INDEX "naver_bulk_jobs_owner_created_idx" ON "naver_bulk_jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "naver_bulk_jobs_status_updated_idx" ON "naver_bulk_jobs" USING btree ("status","updated_at");