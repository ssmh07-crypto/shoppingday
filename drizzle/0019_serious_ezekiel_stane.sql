CREATE TABLE "naver_delivery_policy_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"policy_code" text NOT NULL,
	"name" text NOT NULL,
	"delivery_info" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "naver_delivery_policy_templates_code_check" CHECK ("naver_delivery_policy_templates"."policy_code" ~ '^[0-9]{6}$'),
	CONSTRAINT "naver_delivery_policy_templates_name_check" CHECK (length(trim("naver_delivery_policy_templates"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "product_naver_delivery_policy_selections" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"delivery_policy_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "naver_delivery_policy_templates" ADD CONSTRAINT "naver_delivery_policy_templates_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_delivery_policy_templates" ADD CONSTRAINT "naver_delivery_policy_templates_store_connection_id_naver_store_settings_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."naver_store_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_naver_delivery_policy_selections" ADD CONSTRAINT "product_naver_delivery_policy_selections_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_naver_delivery_policy_selections" ADD CONSTRAINT "product_naver_delivery_policy_selections_delivery_policy_id_naver_delivery_policy_templates_id_fk" FOREIGN KEY ("delivery_policy_id") REFERENCES "public"."naver_delivery_policy_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "naver_delivery_policy_templates_store_code_uidx" ON "naver_delivery_policy_templates" USING btree ("store_connection_id","policy_code");--> statement-breakpoint
CREATE INDEX "naver_delivery_policy_templates_user_store_idx" ON "naver_delivery_policy_templates" USING btree ("user_id","store_connection_id","created_at");--> statement-breakpoint
CREATE INDEX "product_naver_delivery_policy_selections_policy_idx" ON "product_naver_delivery_policy_selections" USING btree ("delivery_policy_id");