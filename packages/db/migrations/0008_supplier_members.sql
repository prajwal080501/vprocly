CREATE TABLE "supplier_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_supplier_id" uuid NOT NULL,
	"email" text NOT NULL,
	"keycloak_subject" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_members_keycloak_subject_unique" UNIQUE("keycloak_subject"),
	CONSTRAINT "supplier_members_platform_supplier_id_email_unique" UNIQUE("platform_supplier_id","email")
);
--> statement-breakpoint
ALTER TABLE "platform_suppliers" DROP CONSTRAINT "platform_suppliers_keycloak_subject_unique";--> statement-breakpoint
ALTER TABLE "supplier_members" ADD CONSTRAINT "supplier_members_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_suppliers" DROP COLUMN "keycloak_subject";