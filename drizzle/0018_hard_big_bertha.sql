ALTER TABLE "naver_store_settings" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
ALTER TABLE "naver_store_settings" ADD COLUMN "auth_type" text;
--> statement-breakpoint
ALTER TABLE "naver_store_settings" ADD COLUMN "is_default" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "naver_store_settings"
SET "auth_type" = 'SELF',
    "account_id" = NULL;
--> statement-breakpoint
ALTER TABLE "naver_store_settings" ALTER COLUMN "auth_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "naver_store_settings" DROP CONSTRAINT "naver_store_settings_pkey";
--> statement-breakpoint
ALTER TABLE "naver_store_settings" ADD PRIMARY KEY ("id");
--> statement-breakpoint

CREATE TABLE "product_naver_store_targets" (
  "product_id" uuid PRIMARY KEY NOT NULL,
  "store_connection_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DROP INDEX "channel_publication_policies_user_channel_uidx";
--> statement-breakpoint
DROP INDEX "product_publication_policy_overrides_product_channel_uidx";
--> statement-breakpoint
DROP INDEX "product_publications_product_channel_uidx";
--> statement-breakpoint

ALTER TABLE "channel_publication_policies" ADD COLUMN "store_connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "product_publication_policy_overrides" ADD COLUMN "store_connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "product_publications" ADD COLUMN "store_connection_id" uuid;
--> statement-breakpoint

UPDATE "channel_publication_policies" AS policy
SET "store_connection_id" = store."id"
FROM "naver_store_settings" AS store
WHERE store."user_id" = policy."user_id";
--> statement-breakpoint
UPDATE "product_publication_policy_overrides" AS override
SET "store_connection_id" = store."id"
FROM "products" AS product
JOIN "naver_store_settings" AS store
  ON store."user_id" = product."owner_id"
WHERE product."id" = override."product_id";
--> statement-breakpoint
UPDATE "product_publications" AS publication
SET "store_connection_id" = store."id"
FROM "products" AS product
JOIN "naver_store_settings" AS store
  ON store."user_id" = product."owner_id"
WHERE product."id" = publication."product_id";
--> statement-breakpoint

ALTER TABLE "channel_publication_policies" ALTER COLUMN "store_connection_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_publication_policy_overrides" ALTER COLUMN "store_connection_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_publications" ALTER COLUMN "store_connection_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "product_naver_store_targets" ADD CONSTRAINT "product_naver_store_targets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_naver_store_targets" ADD CONSTRAINT "product_naver_store_targets_store_connection_id_naver_store_settings_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."naver_store_settings"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "product_naver_store_targets_connection_idx" ON "product_naver_store_targets" USING btree ("store_connection_id");
--> statement-breakpoint
ALTER TABLE "channel_publication_policies" ADD CONSTRAINT "channel_publication_policies_store_connection_id_naver_store_settings_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."naver_store_settings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_publication_policy_overrides" ADD CONSTRAINT "product_publication_policy_overrides_store_connection_id_naver_store_settings_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."naver_store_settings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_publications" ADD CONSTRAINT "product_publications_store_connection_id_naver_store_settings_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."naver_store_settings"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_publication_policies_user_channel_store_uidx" ON "channel_publication_policies" USING btree ("user_id","channel","store_connection_id");
--> statement-breakpoint
CREATE INDEX "naver_store_connections_user_idx" ON "naver_store_settings" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "naver_store_connections_user_url_uidx" ON "naver_store_settings" USING btree ("user_id","store_url");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_publication_policy_overrides_product_channel_store_uidx" ON "product_publication_policy_overrides" USING btree ("product_id","channel","store_connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_publications_product_channel_store_uidx" ON "product_publications" USING btree ("product_id","channel","store_connection_id");
--> statement-breakpoint
ALTER TABLE "naver_store_settings" ADD CONSTRAINT "naver_store_connections_auth_type_check" CHECK ("naver_store_settings"."auth_type" in ('SELF', 'SELLER'));
--> statement-breakpoint
ALTER TABLE "naver_store_settings" ADD CONSTRAINT "naver_store_connections_seller_account_check" CHECK (("naver_store_settings"."auth_type" = 'SELF' and "naver_store_settings"."account_id" is null) or ("naver_store_settings"."auth_type" = 'SELLER' and length("naver_store_settings"."account_id") > 0));
