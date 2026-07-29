CREATE TABLE "naver_store_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"store_name" text NOT NULL,
	"store_url" text NOT NULL,
	"account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "naver_store_settings" ADD CONSTRAINT "naver_store_settings_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "sourcing_product_code_seq" START WITH 1 INCREMENT BY 1;
--> statement-breakpoint
WITH numbered AS (
	SELECT sp."id", row_number() OVER (ORDER BY sp."created_at", sp."id") AS sequence_value
	FROM "supplier_products" sp
	INNER JOIN "suppliers" s ON s."id" = sp."supplier_id"
	WHERE s."code" = 'sourcing'
)
UPDATE "supplier_products" sp
SET "external_product_id" = 'SC' || lpad(numbered.sequence_value::text, 6, '0')
FROM numbered
WHERE sp."id" = numbered."id";
--> statement-breakpoint
SELECT setval(
	'sourcing_product_code_seq',
	COALESCE((
		SELECT max(substring(sp."external_product_id" from 3)::integer)
		FROM "supplier_products" sp
		INNER JOIN "suppliers" s ON s."id" = sp."supplier_id"
		WHERE s."code" = 'sourcing' AND sp."external_product_id" ~ '^SC[0-9]{6}$'
	), 0) + 1,
	false
);
