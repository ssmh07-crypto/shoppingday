CREATE TABLE "supplier_sync_schedules" (
	"supplier_code" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval_hours" integer DEFAULT 24 NOT NULL,
	"next_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_sync_schedules_provider_check" CHECK ("supplier_sync_schedules"."supplier_code" = 'dome'),
	CONSTRAINT "supplier_sync_schedules_interval_check" CHECK ("supplier_sync_schedules"."interval_hours" in (6, 12, 24))
);
--> statement-breakpoint
ALTER TABLE "supplier_sync_schedules" ADD CONSTRAINT "supplier_sync_schedules_owner_id_user_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_sync_schedules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "supplier_sync_schedules_owner_policy" ON "supplier_sync_schedules"
FOR ALL TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());
