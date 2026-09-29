-- Domain-agnostic categories: the fixed, migration-grown taxonomy (0004, 0010) becomes a self-growing
-- vocabulary instead. CategoryResolverService (apps/api/.../category-resolver.service.ts) embeds whatever
-- free text a buyer or supplier types and reuses an existing category if one is already close enough in
-- meaning, so no human has to pre-seed a vocabulary for a new industry ever again. See the plan doc's
-- "Phase D-prerequisite" section.

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE TABLE "supplier_research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"candidates_found" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_suppliers" ALTER COLUMN "gst" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "platform_suppliers" ADD COLUMN "discovery_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "supplier_research_runs" ADD CONSTRAINT "supplier_research_runs_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Approximate nearest-neighbor index for CategoryResolverService's "is there already a category close enough
-- in meaning to this text" lookup. HNSW over cosine distance, matching the `cosineDistance()` operator the
-- resolver queries with.
CREATE INDEX categories_embedding_idx ON categories USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- Defense in depth, mirroring wallet_balances_nonnegative (migration 0005): only an AI-discovered prospect
-- (not yet signed up for real) may have a null GST. Promotion to 'active' (marketplace-suppliers.service.ts)
-- always supplies a real gst from the signup form.
ALTER TABLE platform_suppliers ADD CONSTRAINT platform_suppliers_gst_required_unless_prospect
  CHECK (gst IS NOT NULL OR status = 'prospect');
--> statement-breakpoint

-- categories was read-only via the app role (migration 0004: SELECT only, "seeded by migration") -- now the
-- app itself creates rows on demand, and the backfill script (packages/db/src/backfill-category-embeddings.ts)
-- needs UPDATE to fill in embeddings for the rows seeded before this migration.
GRANT INSERT, UPDATE ON categories TO vprocly_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON supplier_research_runs TO vprocly_app;