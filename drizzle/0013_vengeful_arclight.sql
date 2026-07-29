CREATE TABLE "sourcing_researches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" text DEFAULT 'researching' NOT NULL,
	"sourcing_keyword" text NOT NULL,
	"monthly_search_volume" integer,
	"six_month_revenue" bigint,
	"market_notes" text DEFAULT '' NOT NULL,
	"coupang_average_price" integer,
	"naver_average_price" integer,
	"expected_selling_price" integer,
	"maximum_purchase_price" integer,
	"signals" jsonb NOT NULL,
	"final_selling_point" text DEFAULT '' NOT NULL,
	"positive_reviews" text DEFAULT '' NOT NULL,
	"negative_reviews" text DEFAULT '' NOT NULL,
	"customer_needs" text DEFAULT '' NOT NULL,
	"product_specs" text DEFAULT '' NOT NULL,
	"primary_target" text DEFAULT '' NOT NULL,
	"reference_notes" text DEFAULT '' NOT NULL,
	"samples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sourcing_researches_status_check" CHECK ("sourcing_researches"."status" in ('researching', 'candidate', 'sample_ordered', 'selected', 'rejected')),
	CONSTRAINT "sourcing_researches_amounts_non_negative" CHECK (("sourcing_researches"."monthly_search_volume" is null or "sourcing_researches"."monthly_search_volume" >= 0)
        and ("sourcing_researches"."six_month_revenue" is null or "sourcing_researches"."six_month_revenue" >= 0)
        and ("sourcing_researches"."coupang_average_price" is null or "sourcing_researches"."coupang_average_price" >= 0)
        and ("sourcing_researches"."naver_average_price" is null or "sourcing_researches"."naver_average_price" >= 0)
        and ("sourcing_researches"."expected_selling_price" is null or "sourcing_researches"."expected_selling_price" >= 0)
        and ("sourcing_researches"."maximum_purchase_price" is null or "sourcing_researches"."maximum_purchase_price" >= 0))
);
--> statement-breakpoint
ALTER TABLE "sourcing_researches" ADD CONSTRAINT "sourcing_researches_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sourcing_researches_owner_updated_idx" ON "sourcing_researches" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "sourcing_researches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sourcing_researches_owner_policy"
ON "sourcing_researches"
FOR ALL TO authenticated
USING ((select auth.uid()) = "owner_id")
WITH CHECK ((select auth.uid()) = "owner_id");
