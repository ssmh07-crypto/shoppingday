CREATE TYPE "public"."supplier_availability" AS ENUM('active', 'sold_out', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft');--> statement-breakpoint
CREATE TYPE "public"."supplier_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'viewer');--> statement-breakpoint
CREATE TABLE "product_supplier_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_product_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_api_call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid,
	"request_id" uuid NOT NULL,
	"request_type" text NOT NULL,
	"sanitized_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"success" boolean NOT NULL,
	"response_status" integer,
	"response_count" integer,
	"duration_ms" integer NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"external_product_id" text NOT NULL,
	"original_name" text,
	"supplier_price" numeric(14, 2),
	"currency" text DEFAULT 'KRW' NOT NULL,
	"availability" "supplier_availability" DEFAULT 'unknown' NOT NULL,
	"original_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"original_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_description" text,
	"raw_payload" jsonb NOT NULL,
	"supplier_created_at" timestamp,
	"supplier_updated_at" timestamp,
	"first_imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_products_price_non_negative" CHECK ("supplier_products"."supplier_price" is null or "supplier_products"."supplier_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "supplier_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_supplier_links" ADD CONSTRAINT "product_supplier_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_supplier_links" ADD CONSTRAINT "product_supplier_links_supplier_product_id_supplier_products_id_fk" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_api_call_logs" ADD CONSTRAINT "supplier_api_call_logs_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_supplier_links_product_supplier_uidx" ON "product_supplier_links" USING btree ("product_id","supplier_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_supplier_links_supplier_product_uidx" ON "product_supplier_links" USING btree ("supplier_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_products_supplier_external_uidx" ON "supplier_products" USING btree ("supplier_id","external_product_id");--> statement-breakpoint
INSERT INTO "suppliers" ("code", "name", "status") VALUES ('dome', '친구도매', 'active') ON CONFLICT ("code") DO NOTHING;
