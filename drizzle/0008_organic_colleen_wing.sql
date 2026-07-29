CREATE TABLE "channel_publication_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"policy" jsonb DEFAULT '{"singleStockQuantity":null,"deliveryInfo":null,"afterServiceInfo":null,"originAreaInfo":null,"productInfoProvidedNotice":null,"taxType":null,"minorPurchasable":null,"naverShoppingRegistration":null,"channelProductDisplayStatusType":null}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_publication_policies_channel_check" CHECK ("channel_publication_policies"."channel" in ('naver'))
);
--> statement-breakpoint
CREATE TABLE "product_publication_policy_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_publication_policy_overrides_channel_check" CHECK ("product_publication_policy_overrides"."channel" in ('naver'))
);
--> statement-breakpoint
ALTER TABLE "channel_publication_policies" ADD CONSTRAINT "channel_publication_policies_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_publication_policy_overrides" ADD CONSTRAINT "product_publication_policy_overrides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_publication_policies_user_channel_uidx" ON "channel_publication_policies" USING btree ("user_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "product_publication_policy_overrides_product_channel_uidx" ON "product_publication_policy_overrides" USING btree ("product_id","channel");