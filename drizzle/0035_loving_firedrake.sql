ALTER TABLE "keyword_managed_products" ADD COLUMN "research_draft" jsonb;--> statement-breakpoint
ALTER TABLE "keyword_managed_products" ADD COLUMN "research_version" integer DEFAULT 0 NOT NULL;