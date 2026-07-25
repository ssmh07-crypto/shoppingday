CREATE TABLE "keyword_rank_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"managed_product_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"normalized_keyword" text NOT NULL,
	"rank" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_rank_observations_rank_check" CHECK ("keyword_rank_observations"."rank" is null or "keyword_rank_observations"."rank" between 1 and 1000),
	CONSTRAINT "keyword_rank_observations_source_check" CHECK ("keyword_rank_observations"."source" in ('manual'))
);
--> statement-breakpoint
ALTER TABLE "keyword_managed_products" ADD COLUMN "store_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD CONSTRAINT "keyword_rank_observations_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rank_observations" ADD CONSTRAINT "keyword_rank_observations_managed_product_id_keyword_managed_products_id_fk" FOREIGN KEY ("managed_product_id") REFERENCES "public"."keyword_managed_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_rank_observations_product_checked_idx" ON "keyword_rank_observations" USING btree ("managed_product_id","checked_at");--> statement-breakpoint
CREATE INDEX "keyword_rank_observations_owner_keyword_idx" ON "keyword_rank_observations" USING btree ("owner_id","normalized_keyword");--> statement-breakpoint
ALTER TABLE "keyword_managed_products" ADD CONSTRAINT "keyword_managed_products_store_connection_id_naver_store_settings_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."naver_store_settings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "keyword_managed_products" AS managed
SET "store_connection_id" = publication."store_connection_id"
FROM "product_publications" AS publication
WHERE managed."store_connection_id" IS NULL
  AND managed."linked_product_id" = publication."product_id"
  AND managed."channel_product_no" = publication."channel_product_no";--> statement-breakpoint
CREATE INDEX "keyword_managed_products_store_idx" ON "keyword_managed_products" USING btree ("store_connection_id");
