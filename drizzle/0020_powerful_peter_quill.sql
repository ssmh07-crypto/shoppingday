ALTER TABLE "product_publications" ADD COLUMN "remote_status_type" text;--> statement-breakpoint
UPDATE "product_publications"
SET "remote_status_type" = 'SALE'
WHERE "status" = 'published'
  AND "origin_product_no" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "product_publications" ADD CONSTRAINT "product_publications_remote_status_check" CHECK ("product_publications"."remote_status_type" is null or "product_publications"."remote_status_type" in ('SALE', 'OUTOFSTOCK', 'SUSPENSION', 'DELETE'));
