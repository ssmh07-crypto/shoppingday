CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE INDEX "products_title_trgm_idx" ON "products" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "supplier_products_original_name_trgm_idx" ON "supplier_products" USING gin ("original_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "supplier_products_external_id_trgm_idx" ON "supplier_products" USING gin ("external_product_id" gin_trgm_ops);
