CREATE TYPE "public"."external_data_source" AS ENUM('openai', 'naver_search_ad', 'naver_api_hub', 'mock');--> statement-breakpoint
CREATE TYPE "public"."keyword_competition" AS ENUM('low', 'medium', 'high', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."keyword_metrics_status" AS ENUM('pending', 'success', 'not_found', 'error');--> statement-breakpoint
CREATE TYPE "public"."keyword_size" AS ENUM('small', 'medium', 'large', 'unclassified');--> statement-breakpoint
CREATE TABLE "generated_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"managed_product_id" uuid NOT NULL,
	"selected_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_title" text NOT NULL,
	"edited_title" text NOT NULL,
	"model" text NOT NULL,
	"source" "external_data_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"managed_product_id" uuid NOT NULL,
	"analysis_id" uuid,
	"keyword" text NOT NULL,
	"normalized_keyword" text NOT NULL,
	"ai_reason" text DEFAULT '' NOT NULL,
	"source_concepts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_order" integer NOT NULL,
	"monthly_pc_search_volume" integer,
	"monthly_mobile_search_volume" integer,
	"total_monthly_search_volume" integer,
	"raw_monthly_pc_search_volume" text,
	"raw_monthly_mobile_search_volume" text,
	"competition" "keyword_competition" DEFAULT 'unknown' NOT NULL,
	"keyword_size" "keyword_size" DEFAULT 'unclassified' NOT NULL,
	"metrics_status" "keyword_metrics_status" DEFAULT 'pending' NOT NULL,
	"metrics_source" "external_data_source",
	"metrics_fetched_at" timestamp with time zone,
	"is_selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_candidates_ai_order_non_negative" CHECK ("keyword_candidates"."ai_order" >= 0),
	CONSTRAINT "keyword_candidates_metrics_non_negative" CHECK (("keyword_candidates"."monthly_pc_search_volume" is null or "keyword_candidates"."monthly_pc_search_volume" >= 0)
        and ("keyword_candidates"."monthly_mobile_search_volume" is null or "keyword_candidates"."monthly_mobile_search_volume" >= 0)
        and ("keyword_candidates"."total_monthly_search_volume" is null or "keyword_candidates"."total_monthly_search_volume" >= 0))
);
--> statement-breakpoint
CREATE TABLE "keyword_managed_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"linked_product_id" uuid,
	"smartstore_url" text NOT NULL,
	"channel_product_no" text,
	"supplier_title" text NOT NULL,
	"editable_title" text NOT NULL,
	"final_title" text,
	"product_input" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_managed_products_status_check" CHECK ("keyword_managed_products"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "keyword_metric_cache" (
	"normalized_keyword" text PRIMARY KEY NOT NULL,
	"metrics" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_keyword_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"managed_product_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"analysis" jsonb NOT NULL,
	"model" text NOT NULL,
	"source" "external_data_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_keyword_analyses_input_hash_check" CHECK ("product_keyword_analyses"."input_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "generated_titles" ADD CONSTRAINT "generated_titles_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_titles" ADD CONSTRAINT "generated_titles_managed_product_id_keyword_managed_products_id_fk" FOREIGN KEY ("managed_product_id") REFERENCES "public"."keyword_managed_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD CONSTRAINT "keyword_candidates_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD CONSTRAINT "keyword_candidates_managed_product_id_keyword_managed_products_id_fk" FOREIGN KEY ("managed_product_id") REFERENCES "public"."keyword_managed_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD CONSTRAINT "keyword_candidates_analysis_id_product_keyword_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."product_keyword_analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_managed_products" ADD CONSTRAINT "keyword_managed_products_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_managed_products" ADD CONSTRAINT "keyword_managed_products_linked_product_id_products_id_fk" FOREIGN KEY ("linked_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_keyword_analyses" ADD CONSTRAINT "product_keyword_analyses_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_keyword_analyses" ADD CONSTRAINT "product_keyword_analyses_managed_product_id_keyword_managed_products_id_fk" FOREIGN KEY ("managed_product_id") REFERENCES "public"."keyword_managed_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_titles_product_created_idx" ON "generated_titles" USING btree ("managed_product_id","created_at");--> statement-breakpoint
CREATE INDEX "generated_titles_owner_idx" ON "generated_titles" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_candidates_product_normalized_uidx" ON "keyword_candidates" USING btree ("managed_product_id","normalized_keyword");--> statement-breakpoint
CREATE INDEX "keyword_candidates_product_order_idx" ON "keyword_candidates" USING btree ("managed_product_id","ai_order");--> statement-breakpoint
CREATE INDEX "keyword_candidates_owner_idx" ON "keyword_candidates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "keyword_managed_products_owner_updated_idx" ON "keyword_managed_products" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_managed_products_owner_channel_uidx" ON "keyword_managed_products" USING btree ("owner_id","channel_product_no") WHERE "keyword_managed_products"."channel_product_no" is not null;--> statement-breakpoint
CREATE INDEX "keyword_metric_cache_expires_idx" ON "keyword_metric_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "product_keyword_analyses_product_created_idx" ON "product_keyword_analyses" USING btree ("managed_product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_keyword_analyses_owner_idx" ON "product_keyword_analyses" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "keyword_managed_products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_keyword_analyses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "keyword_candidates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "generated_titles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "keyword_managed_products_owner_policy"
ON "keyword_managed_products"
FOR ALL TO authenticated
USING ((select auth.uid()) = "owner_id")
WITH CHECK ((select auth.uid()) = "owner_id");
--> statement-breakpoint
CREATE POLICY "product_keyword_analyses_owner_policy"
ON "product_keyword_analyses"
FOR ALL TO authenticated
USING ((select auth.uid()) = "owner_id")
WITH CHECK ((select auth.uid()) = "owner_id");
--> statement-breakpoint
CREATE POLICY "keyword_candidates_owner_policy"
ON "keyword_candidates"
FOR ALL TO authenticated
USING ((select auth.uid()) = "owner_id")
WITH CHECK ((select auth.uid()) = "owner_id");
--> statement-breakpoint
CREATE POLICY "generated_titles_owner_policy"
ON "generated_titles"
FOR ALL TO authenticated
USING ((select auth.uid()) = "owner_id")
WITH CHECK ((select auth.uid()) = "owner_id");
