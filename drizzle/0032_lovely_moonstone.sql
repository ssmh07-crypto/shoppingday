CREATE TABLE "supplier_price_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"target_price" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"attempted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "supplier_price_applications_price_positive" CHECK ("supplier_price_applications"."target_price" > 0),
	CONSTRAINT "supplier_price_applications_status_check" CHECK ("supplier_price_applications"."status" in ('pending','running','succeeded','failed','superseded'))
);
--> statement-breakpoint
ALTER TABLE "supplier_price_applications" ADD CONSTRAINT "supplier_price_applications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_applications" ADD CONSTRAINT "supplier_price_applications_publication_id_product_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."product_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_price_applications_pending_idx" ON "supplier_price_applications" USING btree ("status","created_at");
--> statement-breakpoint
ALTER TABLE "supplier_price_applications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "supplier_price_applications_owner_policy" ON "supplier_price_applications"
FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM products WHERE products.id = product_id AND products.owner_id = auth.uid()));
