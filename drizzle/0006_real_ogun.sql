CREATE TABLE "product_processing_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sync_protected_fields" jsonb DEFAULT '["title","description","images","options"]'::jsonb NOT NULL,
	"apply_category_query_to_title_by_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_processing_settings" ADD CONSTRAINT "product_processing_settings_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;