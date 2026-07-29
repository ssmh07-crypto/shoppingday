ALTER TABLE "keyword_rank_observations" DROP CONSTRAINT "keyword_rank_observations_source_check";--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD COLUMN "device" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD COLUMN "result_status" text DEFAULT 'found' NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD COLUMN "checked_range" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
UPDATE "keyword_rank_observations" SET "result_status" = 'not_found' WHERE "rank" IS NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_title_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD CONSTRAINT "keyword_rank_observations_device_check" CHECK ("keyword_rank_observations"."device" in ('unknown', 'pc', 'mobile'));--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD CONSTRAINT "keyword_rank_observations_result_status_check" CHECK ("keyword_rank_observations"."result_status" in ('found', 'not_found', 'blocked', 'failed'));--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD CONSTRAINT "keyword_rank_observations_checked_range_check" CHECK ("keyword_rank_observations"."checked_range" between 1 and 1000);--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD CONSTRAINT "keyword_rank_observations_source_check" CHECK ("keyword_rank_observations"."source" in ('manual', 'browser_observed'));
