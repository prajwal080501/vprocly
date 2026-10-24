ALTER TABLE "supplier_research_runs" ADD COLUMN "cache_hits" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "query_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "gemini_calls" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "places_calls" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "duplicates_removed" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "duration_ms" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "estimated_cost_micros" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_research_runs" ADD COLUMN "stop_reason" text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_item_claims" ADD COLUMN "source_type" text DEFAULT 'supplier_website' NOT NULL;
ALTER TABLE "supplier_item_claims" ADD COLUMN "source_weight" numeric(5, 4) DEFAULT '0.7000' NOT NULL;
ALTER TABLE "supplier_item_claims" ADD COLUMN "outcome_score" numeric(5, 4) DEFAULT '0.5000' NOT NULL;
ALTER TABLE "supplier_item_claims" ADD COLUMN "positive_signals" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_item_claims" ADD COLUMN "negative_signals" integer DEFAULT 0 NOT NULL;
ALTER TABLE "supplier_item_claims" ADD COLUMN "review_status" text DEFAULT 'unreviewed' NOT NULL;
ALTER TABLE "supplier_item_claims" ADD COLUMN "last_outcome_at" timestamptz;
--> statement-breakpoint
CREATE INDEX "supplier_item_claims_description_fts_idx" ON "supplier_item_claims" USING gin (to_tsvector('simple', "description"));
--> statement-breakpoint
CREATE TABLE "item_equivalences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_fingerprint" text NOT NULL,
  "target_fingerprint" text NOT NULL,
  "source_description" text NOT NULL,
  "target_description" text NOT NULL,
  "relationship" text DEFAULT 'possible_equivalent' NOT NULL,
  "status" text DEFAULT 'proposed' NOT NULL,
  "confidence" numeric(5, 4) NOT NULL,
  "evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "proposed_by" text DEFAULT 'retrieval' NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "item_equivalences_source_fingerprint_target_fingerprint_relationship_unique" UNIQUE("source_fingerprint", "target_fingerprint", "relationship")
);
CREATE INDEX "item_equivalences_review_idx" ON "item_equivalences" USING btree ("status", "created_at");
CREATE INDEX "item_equivalences_source_idx" ON "item_equivalences" USING btree ("source_fingerprint", "status");
CREATE INDEX "item_equivalences_target_idx" ON "item_equivalences" USING btree ("target_fingerprint", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON item_equivalences TO vprocly_app;
--> statement-breakpoint
ALTER TABLE "sourcing_line_notifications" ADD COLUMN "item_fingerprint" text;
CREATE INDEX "sourcing_line_notifications_item_idx" ON "sourcing_line_notifications" USING btree ("item_fingerprint", "platform_supplier_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apply_supplier_item_learning_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fingerprint text;
  v_positive integer := 0;
  v_negative integer := 0;
  v_delta numeric := 0;
BEGIN
  SELECT n.item_fingerprint INTO v_fingerprint
    FROM sourcing_line_notifications n
   WHERE n.sourcing_line_id = NEW.sourcing_line_id
     AND n.platform_supplier_id = NEW.platform_supplier_id
     AND n.item_fingerprint IS NOT NULL
   LIMIT 1;
  IF v_fingerprint IS NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'supplier_line_responses' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
    IF NEW.status = 'can_supply' THEN v_positive := 1; v_delta := 0.10;
    ELSIF NEW.status = 'declined' THEN v_negative := 1; v_delta := -0.20;
    END IF;
  ELSIF TG_TABLE_NAME = 'bids' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
    v_positive := 1; v_delta := 0.15;
  ELSIF TG_TABLE_NAME = 'purchase_order_outcomes' THEN
    IF NEW.type = 'delivered' THEN v_positive := 1; v_delta := 0.20;
    ELSIF NEW.type = 'quality_accepted' THEN v_positive := 1; v_delta := 0.20;
    ELSIF NEW.type = 'quality_rejected' THEN v_negative := 1; v_delta := -0.25;
    ELSIF NEW.type = 'cancelled' THEN v_negative := 1; v_delta := -0.10;
    ELSIF NEW.type = 'disputed' THEN v_negative := 1; v_delta := -0.15;
    ELSE RETURN NEW;
    END IF;
  END IF;

  UPDATE supplier_item_claims SET
    outcome_score = greatest(0, least(1, outcome_score + v_delta)),
    positive_signals = positive_signals + v_positive,
    negative_signals = negative_signals + v_negative,
    last_outcome_at = now(),
    updated_at = now()
  WHERE platform_supplier_id = NEW.platform_supplier_id AND item_fingerprint = v_fingerprint;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION apply_supplier_item_learning_signal() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER supplier_line_response_learning AFTER INSERT OR UPDATE ON supplier_line_responses FOR EACH ROW EXECUTE FUNCTION apply_supplier_item_learning_signal();
CREATE TRIGGER supplier_bid_learning AFTER INSERT ON bids FOR EACH ROW EXECUTE FUNCTION apply_supplier_item_learning_signal();
CREATE TRIGGER purchase_order_outcome_learning AFTER INSERT ON purchase_order_outcomes FOR EACH ROW EXECUTE FUNCTION apply_supplier_item_learning_signal();
