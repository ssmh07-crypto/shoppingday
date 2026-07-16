CREATE TABLE "naver_commerce_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"whole_category_name" text NOT NULL,
	"last" boolean NOT NULL,
	"sync_batch_id" uuid NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "naver_commerce_categories_name_idx" ON "naver_commerce_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "naver_commerce_categories_last_idx" ON "naver_commerce_categories" USING btree ("last");