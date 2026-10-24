ALTER TABLE "supplier_research_runs" ADD COLUMN "gemini_input_tokens" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "gemini_output_tokens" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "grounding_queries" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "places_id_searches" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "places_detail_calls" integer DEFAULT 0 NOT NULL;
