CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "platform_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"gst" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"keycloak_subject" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_suppliers_email_unique" UNIQUE("email"),
	CONSTRAINT "platform_suppliers_keycloak_subject_unique" UNIQUE("keycloak_subject")
);
--> statement-breakpoint
CREATE TABLE "supplier_categories" (
	"platform_supplier_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "supplier_categories_platform_supplier_id_category_id_pk" PRIMARY KEY("platform_supplier_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_balances" (
	"platform_supplier_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"platform_supplier_id" uuid NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sourcing_line_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sourcing_line_id" uuid NOT NULL,
	"email" text NOT NULL,
	"platform_supplier_id" uuid,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sourcing_line_notifications_sourcing_line_id_email_unique" UNIQUE("sourcing_line_id","email")
);
--> statement-breakpoint
CREATE TABLE "sourcing_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sourcing_request_id" uuid NOT NULL,
	"item_code" text,
	"description" text NOT NULL,
	"category_id" uuid NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"uom" text NOT NULL,
	"delivery_city" text NOT NULL,
	"delivery_state" text NOT NULL,
	"need_by" date,
	"status" text DEFAULT 'open' NOT NULL,
	"source_system" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"source_ref" jsonb,
	"import_batch_id" uuid,
	"correlation_id" uuid,
	"created_by" uuid,
	"confidence" numeric(5, 4),
	"validation_status" text DEFAULT 'valid' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sourcing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_line_notifications" ADD CONSTRAINT "sourcing_line_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_line_notifications" ADD CONSTRAINT "sourcing_line_notifications_sourcing_line_id_sourcing_lines_id_fk" FOREIGN KEY ("sourcing_line_id") REFERENCES "public"."sourcing_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_line_notifications" ADD CONSTRAINT "sourcing_line_notifications_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_lines" ADD CONSTRAINT "sourcing_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_lines" ADD CONSTRAINT "sourcing_lines_sourcing_request_id_sourcing_requests_id_fk" FOREIGN KEY ("sourcing_request_id") REFERENCES "public"."sourcing_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_lines" ADD CONSTRAINT "sourcing_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_requests" ADD CONSTRAINT "sourcing_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sourcing_line_notifications_line_idx" ON "sourcing_line_notifications" USING btree ("sourcing_line_id");