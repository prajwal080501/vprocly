ALTER TABLE "supplier_research_runs" ADD COLUMN "item_fingerprint" text;
--> statement-breakpoint
CREATE INDEX "supplier_research_runs_item_idx" ON "supplier_research_runs" USING btree ("item_fingerprint", "triggered_at");
--> statement-breakpoint
CREATE TABLE "supplier_item_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform_supplier_id" uuid NOT NULL,
  "item_fingerprint" text NOT NULL,
  "description" text NOT NULL,
  "match_score" numeric(5, 4) NOT NULL,
  "evidence_score" numeric(5, 4) NOT NULL,
  "matched_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "search_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_verified_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_item_claims_platform_supplier_id_item_fingerprint_unique" UNIQUE("platform_supplier_id", "item_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "supplier_item_claims" ADD CONSTRAINT "supplier_item_claims_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "supplier_item_claims_item_idx" ON "supplier_item_claims" USING btree ("item_fingerprint", "expires_at");
CREATE INDEX "supplier_item_claims_supplier_idx" ON "supplier_item_claims" USING btree ("platform_supplier_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_item_claims TO vprocly_app;
