ALTER TYPE "public"."product_status" ADD VALUE 'editing';--> statement-breakpoint
ALTER TYPE "public"."product_status" ADD VALUE 'ready';--> statement-breakpoint
ALTER TYPE "public"."product_status" ADD VALUE 'archived';--> statement-breakpoint
CREATE TABLE "product_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'product' NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"old_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"new_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "selling_price" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "currency" text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "selected_images" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "edited_options" jsonb DEFAULT '{"groups":[],"combinations":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "draft_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "validation_errors" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
UPDATE "products" p
SET "owner_id" = (SELECT "user_id" FROM "user_profiles" WHERE "role" = 'admin' ORDER BY "created_at" LIMIT 1),
    "title" = COALESCE(sp."original_name", ''),
    "selected_images" = COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', 'supplier-' || (img.ordinality - 1), 'source', 'supplier',
        'sourceUrl', img.url, 'storedUrl', NULL, 'altText', '',
        'sortOrder', img.ordinality - 1, 'isPrimary', img.ordinality = 1, 'enabled', true
      ) ORDER BY img.ordinality)
      FROM jsonb_array_elements_text(sp."original_images") WITH ORDINALITY AS img(url, ordinality)
      WHERE img.url ~ '^https?://'
    ), '[]'::jsonb)
FROM "product_supplier_links" psl
JOIN "supplier_products" sp ON sp."id" = psl."supplier_product_id"
WHERE psl."product_id" = p."id" AND psl."is_primary" = true;--> statement-breakpoint
ALTER TABLE "product_audit_logs" ADD CONSTRAINT "product_audit_logs_actor_id_user_profiles_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_audit_logs" ADD CONSTRAINT "product_audit_logs_entity_id_products_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_audit_entity_idx" ON "product_audit_logs" USING btree ("entity_id","created_at");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_owner_updated_idx" ON "products" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_selling_price_positive" CHECK ("products"."selling_price" is null or "products"."selling_price" > 0);
