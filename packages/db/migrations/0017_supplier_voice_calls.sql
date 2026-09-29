CREATE TABLE "supplier_voice_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"sourcing_line_id" uuid NOT NULL,
	"platform_supplier_id" uuid,
	"provider" text DEFAULT 'sarvam' NOT NULL,
	"phone" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt_id" text,
	"interaction_id" text,
	"duration_seconds" numeric(10, 2),
	"failure_reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_voice_calls_notification_id_unique" UNIQUE("notification_id"),
	CONSTRAINT "supplier_voice_calls_attempt_id_unique" UNIQUE("attempt_id"),
	CONSTRAINT "supplier_voice_calls_status_check" CHECK ("status" IN ('queued', 'dialing', 'connected', 'no_answer', 'busy', 'failed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "supplier_voice_calls" ADD CONSTRAINT "supplier_voice_calls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_voice_calls" ADD CONSTRAINT "supplier_voice_calls_notification_id_sourcing_line_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."sourcing_line_notifications"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_voice_calls" ADD CONSTRAINT "supplier_voice_calls_sourcing_line_id_sourcing_lines_id_fk" FOREIGN KEY ("sourcing_line_id") REFERENCES "public"."sourcing_lines"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_voice_calls" ADD CONSTRAINT "supplier_voice_calls_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "supplier_voice_calls_line_idx" ON "supplier_voice_calls" USING btree ("sourcing_line_id");
--> statement-breakpoint
CREATE INDEX "supplier_voice_calls_status_idx" ON "supplier_voice_calls" USING btree ("tenant_id", "status");
--> statement-breakpoint
ALTER TABLE supplier_voice_calls ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE supplier_voice_calls FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON supplier_voice_calls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_voice_calls TO vprocly_app;
