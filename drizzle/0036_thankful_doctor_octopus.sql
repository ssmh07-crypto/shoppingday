CREATE TABLE "supplier_change_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"supplier_product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"previous_value" text NOT NULL,
	"target_value" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "supplier_change_applications_kind_check" CHECK ("supplier_change_applications"."kind" in ('sold_out','discontinued','description')),
	CONSTRAINT "supplier_change_applications_status_check" CHECK ("supplier_change_applications"."status" in ('pending','succeeded','failed','superseded'))
);
--> statement-breakpoint
ALTER TABLE "supplier_sync_schedules" ADD COLUMN "apply_sold_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_sync_schedules" ADD COLUMN "apply_discontinued" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_sync_schedules" ADD COLUMN "apply_descriptions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_change_applications" ADD CONSTRAINT "supplier_change_applications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_change_applications" ADD CONSTRAINT "supplier_change_applications_publication_id_product_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."product_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_change_applications" ADD CONSTRAINT "supplier_change_applications_supplier_product_id_supplier_products_id_fk" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_change_applications_pending_idx" ON "supplier_change_applications" USING btree ("status","created_at");
--> statement-breakpoint
ALTER TABLE "supplier_change_applications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "supplier_change_applications_owner_policy" ON "supplier_change_applications"
FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM products WHERE products.id = product_id AND products.owner_id = auth.uid()));
