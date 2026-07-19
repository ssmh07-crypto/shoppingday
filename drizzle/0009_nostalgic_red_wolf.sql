CREATE TYPE "public"."product_publication_status" AS ENUM('publishing', 'published', 'failed', 'deleting', 'deleted');--> statement-breakpoint
CREATE TABLE "product_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" "product_publication_status" NOT NULL,
	"origin_product_no" text,
	"channel_product_no" text,
	"last_payload_hash" text,
	"attempted_payload_hash" text NOT NULL,
	"last_request_id" uuid NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"last_error_http_status" integer,
	"last_attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_publications_channel_check" CHECK ("product_publications"."channel" in ('naver')),
	CONSTRAINT "product_publications_last_payload_hash_check" CHECK ("product_publications"."last_payload_hash" is null or "product_publications"."last_payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "product_publications_attempted_payload_hash_check" CHECK ("product_publications"."attempted_payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "product_publications_attempt_count_positive" CHECK ("product_publications"."attempt_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "product_publications" ADD CONSTRAINT "product_publications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_publications_product_channel_uidx" ON "product_publications" USING btree ("product_id","channel");--> statement-breakpoint
CREATE INDEX "product_publications_status_idx" ON "product_publications" USING btree ("status","updated_at");