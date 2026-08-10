ALTER TABLE "suppliers" ADD COLUMN "product_number_prefix" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_product_number_prefix_unique" UNIQUE("product_number_prefix");--> statement-breakpoint
UPDATE "suppliers" SET "product_number_prefix" = 'ZG' WHERE "code" = 'zicgam' AND "product_number_prefix" IS NULL;
