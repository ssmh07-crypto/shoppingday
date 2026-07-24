ALTER TABLE "keyword_candidates" ADD COLUMN "origin" text DEFAULT 'rule_combination' NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD COLUMN "review_status" text DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD COLUMN "filter_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD COLUMN "relevance_score" integer;--> statement-breakpoint
ALTER TABLE "keyword_managed_products" ADD COLUMN "current_title" text;--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD CONSTRAINT "keyword_candidates_origin_check" CHECK ("keyword_candidates"."origin" in ('rule_combination', 'naver_related', 'manual'));--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD CONSTRAINT "keyword_candidates_review_status_check" CHECK ("keyword_candidates"."review_status" in ('candidate', 'accepted', 'rejected', 'review'));