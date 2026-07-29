CREATE TABLE "naver_image_upload_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"source_url_hash" text NOT NULL,
	"source_url" text NOT NULL,
	"stored_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "naver_image_upload_cache_hash_check" CHECK ("naver_image_upload_cache"."source_url_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "naver_image_upload_cache" ADD CONSTRAINT "naver_image_upload_cache_store_connection_id_naver_store_settings_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."naver_store_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "naver_image_upload_cache_store_hash_uidx" ON "naver_image_upload_cache" USING btree ("store_connection_id","source_url_hash");--> statement-breakpoint
CREATE INDEX "naver_image_upload_cache_updated_idx" ON "naver_image_upload_cache" USING btree ("updated_at");