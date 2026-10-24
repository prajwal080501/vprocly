-- Phases 4, 5 and 8: explainable supplier ranking, privacy-safe price intelligence and supplier network analytics.

CREATE TABLE supplier_score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  version integer NOT NULL,
  overall_score numeric(5,2) NOT NULL,
  category_match_score numeric(5,2) NOT NULL,
  response_score numeric(5,2) NOT NULL,
  price_score numeric(5,2) NOT NULL,
  lead_time_score numeric(5,2) NOT NULL,
  fulfillment_score numeric(5,2) NOT NULL,
  compliance_score numeric(5,2) NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  explanation jsonb NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_supplier_id, version),
  CHECK (overall_score BETWEEN 0 AND 100),
  CHECK (category_match_score BETWEEN 0 AND 100),
  CHECK (response_score BETWEEN 0 AND 100),
  CHECK (price_score BETWEEN 0 AND 100),
  CHECK (lead_time_score BETWEEN 0 AND 100),
  CHECK (fulfillment_score BETWEEN 0 AND 100),
  CHECK (compliance_score BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE INDEX supplier_score_latest_idx ON supplier_score_snapshots(platform_supplier_id, version DESC);
--> statement-breakpoint

CREATE TABLE price_benchmark_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid NOT NULL REFERENCES categories(id),
  uom text NOT NULL,
  currency text NOT NULL,
  region text NOT NULL DEFAULT '*',
  quote_count integer NOT NULL,
  buyer_count integer NOT NULL,
  supplier_count integer NOT NULL,
  low numeric(16,4) NOT NULL,
  percentile_25 numeric(16,4) NOT NULL,
  median numeric(16,4) NOT NULL,
  percentile_75 numeric(16,4) NOT NULL,
  high numeric(16,4) NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, uom, currency, region),
  CHECK (quote_count >= 5),
  CHECK (buyer_count >= 3),
  CHECK (supplier_count >= 2)
);
--> statement-breakpoint
CREATE INDEX price_benchmark_lookup_idx ON price_benchmark_snapshots(category_id, uom, currency, region);
--> statement-breakpoint

CREATE TABLE supplier_network_preferences (
  platform_supplier_id uuid PRIMARY KEY REFERENCES platform_suppliers(id),
  opportunity_alerts boolean NOT NULL DEFAULT true,
  preferred_channel text NOT NULL DEFAULT 'email',
  digest_frequency text NOT NULL DEFAULT 'instant',
  minimum_recommendation_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (preferred_channel IN ('voice', 'email', 'sms', 'whatsapp')),
  CHECK (digest_frequency IN ('instant', 'daily', 'weekly', 'off')),
  CHECK (minimum_recommendation_score BETWEEN 0 AND 100)
);
--> statement-breakpoint

GRANT SELECT, INSERT ON supplier_score_snapshots TO vprocly_app;
GRANT SELECT ON price_benchmark_snapshots TO vprocly_app;
GRANT SELECT, INSERT, UPDATE ON supplier_network_preferences TO vprocly_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION refresh_supplier_score(p_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_version integer;
  v_attempts integer;
  v_responses integer;
  v_bids integer;
  v_outcomes integer;
  v_deliveries integer;
  v_on_time integer;
  v_positive integer;
  v_negative integer;
  v_category numeric;
  v_response numeric;
  v_price numeric;
  v_lead numeric;
  v_fulfillment numeric;
  v_compliance numeric;
  v_overall numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_suppliers WHERE id = p_supplier_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_supplier_id::text, 0));

  SELECT count(*), count(*) FILTER (WHERE status IN ('connected', 'answered', 'sent', 'delivered', 'completed'))
    INTO v_attempts, v_responses
  FROM supplier_contact_attempts WHERE platform_supplier_id = p_supplier_id;

  SELECT count(*) INTO v_bids FROM bids WHERE platform_supplier_id = p_supplier_id;
  SELECT count(*) INTO v_outcomes FROM purchase_order_outcomes WHERE platform_supplier_id = p_supplier_id;

  SELECT
    count(*) FILTER (WHERE delivered_at IS NOT NULL AND due_at IS NOT NULL),
    count(*) FILTER (WHERE delivered_at IS NOT NULL AND due_at IS NOT NULL AND delivered_at::date <= due_at::date)
    INTO v_deliveries, v_on_time
  FROM (
    SELECT po.id, COALESCE(d.promised_at, po.need_by::timestamptz) AS due_at, d.occurred_at AS delivered_at
    FROM purchase_orders po
    JOIN bids b ON b.id = po.accepted_bid_id
    LEFT JOIN LATERAL (
      SELECT occurred_at, promised_at FROM purchase_order_outcomes o
      WHERE o.purchase_order_id = po.id AND o.type = 'delivered'
      ORDER BY occurred_at DESC LIMIT 1
    ) d ON true
    WHERE b.platform_supplier_id = p_supplier_id
  ) delivery_evidence;

  SELECT
    count(DISTINCT purchase_order_id) FILTER (WHERE type IN ('delivered', 'quality_accepted')),
    count(DISTINCT purchase_order_id) FILTER (WHERE type IN ('quality_rejected', 'cancelled', 'disputed'))
    INTO v_positive, v_negative
  FROM purchase_order_outcomes WHERE platform_supplier_id = p_supplier_id;

  v_category := CASE WHEN EXISTS (SELECT 1 FROM supplier_capabilities WHERE platform_supplier_id = p_supplier_id) THEN 100 ELSE 40 END;
  v_response := round(100 * (v_responses + 2.5) / (v_attempts + 5), 2);

  SELECT COALESCE(round(avg(
    CASE WHEN peer_average IS NULL OR peer_average <= 0 THEN 50
      ELSE greatest(0, least(100, 100 - greatest(0, (unit_price / peer_average) - 1) * 100)) END
  ), 2), 50)
  INTO v_price
  FROM (
    SELECT b.unit_price,
      (SELECT avg(peer.unit_price) FROM bids peer
       WHERE peer.sourcing_line_id = b.sourcing_line_id
         AND peer.platform_supplier_id <> b.platform_supplier_id
         AND peer.currency = b.currency AND peer.status <> 'withdrawn') AS peer_average
    FROM bids b WHERE b.platform_supplier_id = p_supplier_id AND b.status <> 'withdrawn'
  ) price_evidence;

  v_lead := round(100 * (v_on_time + 2.0) / (v_deliveries + 4), 2);
  v_fulfillment := round(100 * (v_positive + 2.5) / (v_positive + v_negative + 5), 2);
  v_compliance := least(100,
    CASE WHEN EXISTS (SELECT 1 FROM supplier_identifiers WHERE platform_supplier_id = p_supplier_id) THEN 30 ELSE 0 END +
    CASE WHEN EXISTS (SELECT 1 FROM supplier_identifiers WHERE platform_supplier_id = p_supplier_id AND verification_status = 'verified') THEN 20 ELSE 0 END +
    CASE WHEN EXISTS (SELECT 1 FROM supplier_capabilities WHERE platform_supplier_id = p_supplier_id) THEN 20 ELSE 0 END +
    CASE WHEN EXISTS (SELECT 1 FROM supplier_locations WHERE platform_supplier_id = p_supplier_id) THEN 15 ELSE 0 END +
    CASE WHEN EXISTS (SELECT 1 FROM supplier_certifications WHERE platform_supplier_id = p_supplier_id AND (expires_at IS NULL OR expires_at > now())) THEN 15 ELSE 0 END
  );
  v_overall := round(v_category * .25 + v_response * .15 + v_price * .20 + v_lead * .15 + v_fulfillment * .15 + v_compliance * .10, 2);
  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM supplier_score_snapshots WHERE platform_supplier_id = p_supplier_id;

  INSERT INTO supplier_score_snapshots (
    platform_supplier_id, version, overall_score, category_match_score, response_score, price_score,
    lead_time_score, fulfillment_score, compliance_score, sample_size, explanation
  ) VALUES (
    p_supplier_id, v_version, v_overall, v_category, v_response, v_price,
    v_lead, v_fulfillment, v_compliance, v_attempts + v_bids + v_outcomes,
    jsonb_build_object(
      'contactAttempts', v_attempts, 'successfulResponses', v_responses, 'bids', v_bids,
      'deliveriesMeasured', v_deliveries, 'onTimeDeliveries', v_on_time,
      'positiveOutcomes', v_positive, 'negativeOutcomes', v_negative,
      'smoothing', 'Bayesian priors protect new suppliers from zero-history penalties'
    )
  );
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION trigger_refresh_supplier_score()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM refresh_supplier_score(COALESCE(NEW.platform_supplier_id, OLD.platform_supplier_id));
  RETURN COALESCE(NEW, OLD);
END $$;
--> statement-breakpoint

CREATE TRIGGER supplier_score_contact_attempt AFTER INSERT OR UPDATE OR DELETE ON supplier_contact_attempts FOR EACH ROW EXECUTE FUNCTION trigger_refresh_supplier_score();
CREATE TRIGGER supplier_score_bid AFTER INSERT OR UPDATE OR DELETE ON bids FOR EACH ROW EXECUTE FUNCTION trigger_refresh_supplier_score();
CREATE TRIGGER supplier_score_outcome AFTER INSERT OR UPDATE OR DELETE ON purchase_order_outcomes FOR EACH ROW EXECUTE FUNCTION trigger_refresh_supplier_score();
CREATE TRIGGER supplier_score_identifier AFTER INSERT OR UPDATE OR DELETE ON supplier_identifiers FOR EACH ROW EXECUTE FUNCTION trigger_refresh_supplier_score();
CREATE TRIGGER supplier_score_location AFTER INSERT OR UPDATE OR DELETE ON supplier_locations FOR EACH ROW EXECUTE FUNCTION trigger_refresh_supplier_score();
CREATE TRIGGER supplier_score_capability AFTER INSERT OR UPDATE OR DELETE ON supplier_capabilities FOR EACH ROW EXECUTE FUNCTION trigger_refresh_supplier_score();
CREATE TRIGGER supplier_score_certification AFTER INSERT OR UPDATE OR DELETE ON supplier_certifications FOR EACH ROW EXECUTE FUNCTION trigger_refresh_supplier_score();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION refresh_price_benchmark(p_category_id uuid, p_uom text, p_currency text, p_region text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quote_count integer;
  v_buyer_count integer;
  v_supplier_count integer;
  v_low numeric;
  v_p25 numeric;
  v_median numeric;
  v_p75 numeric;
  v_high numeric;
BEGIN
  SELECT count(*), count(DISTINCT tenant_id), count(DISTINCT platform_supplier_id),
    min(landed_unit_cost), percentile_cont(.25) WITHIN GROUP (ORDER BY landed_unit_cost),
    percentile_cont(.5) WITHIN GROUP (ORDER BY landed_unit_cost),
    percentile_cont(.75) WITHIN GROUP (ORDER BY landed_unit_cost), max(landed_unit_cost)
  INTO v_quote_count, v_buyer_count, v_supplier_count, v_low, v_p25, v_median, v_p75, v_high
  FROM (
    SELECT b.tenant_id, b.platform_supplier_id,
      ((b.unit_price * l.qty) * (1 + COALESCE(b.tax_percent, 0) / 100) + COALESCE(b.freight_amount, 0)) / NULLIF(l.qty, 0) AS landed_unit_cost
    FROM bids b JOIN sourcing_lines l ON l.id = b.sourcing_line_id
    WHERE l.category_id = p_category_id AND upper(l.uom) = upper(p_uom)
      AND upper(b.currency) = upper(p_currency) AND b.status <> 'withdrawn'
      AND (p_region = '*' OR lower(l.delivery_state) = lower(p_region))
  ) normalized_quotes;

  IF v_quote_count >= 5 AND v_buyer_count >= 3 AND v_supplier_count >= 2 THEN
    INSERT INTO price_benchmark_snapshots (
      category_id, uom, currency, region, quote_count, buyer_count, supplier_count,
      low, percentile_25, median, percentile_75, high, calculated_at
    ) VALUES (
      p_category_id, upper(p_uom), upper(p_currency), p_region, v_quote_count, v_buyer_count, v_supplier_count,
      v_low, v_p25, v_median, v_p75, v_high, now()
    ) ON CONFLICT (category_id, uom, currency, region) DO UPDATE SET
      quote_count = EXCLUDED.quote_count, buyer_count = EXCLUDED.buyer_count, supplier_count = EXCLUDED.supplier_count,
      low = EXCLUDED.low, percentile_25 = EXCLUDED.percentile_25, median = EXCLUDED.median,
      percentile_75 = EXCLUDED.percentile_75, high = EXCLUDED.high, calculated_at = now();
  ELSE
    DELETE FROM price_benchmark_snapshots
    WHERE category_id = p_category_id AND uom = upper(p_uom) AND currency = upper(p_currency) AND region = p_region;
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION trigger_refresh_price_benchmark()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line sourcing_lines%ROWTYPE;
  v_currency text;
BEGIN
  SELECT * INTO v_line FROM sourcing_lines WHERE id = COALESCE(NEW.sourcing_line_id, OLD.sourcing_line_id);
  v_currency := COALESCE(NEW.currency, OLD.currency);
  IF v_line.id IS NOT NULL THEN
    PERFORM refresh_price_benchmark(v_line.category_id, v_line.uom, v_currency, '*');
    PERFORM refresh_price_benchmark(v_line.category_id, v_line.uom, v_currency, v_line.delivery_state);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.currency IS DISTINCT FROM NEW.currency THEN
    PERFORM refresh_price_benchmark(v_line.category_id, v_line.uom, OLD.currency, '*');
    PERFORM refresh_price_benchmark(v_line.category_id, v_line.uom, OLD.currency, v_line.delivery_state);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
--> statement-breakpoint

CREATE TRIGGER price_benchmark_bid AFTER INSERT OR UPDATE OR DELETE ON bids FOR EACH ROW EXECUTE FUNCTION trigger_refresh_price_benchmark();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION supplier_network_insights(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH supplier AS (
  SELECT id, email FROM platform_suppliers WHERE id = p_supplier_id
), opportunities AS (
  SELECT DISTINCT n.sourcing_line_id
  FROM sourcing_line_notifications n CROSS JOIN supplier s
  WHERE n.platform_supplier_id = s.id OR lower(n.email) = lower(s.email)
), opportunity_stats AS (
  SELECT count(*) AS total,
    count(*) FILTER (WHERE l.status = 'open') AS active
  FROM opportunities o JOIN sourcing_lines l ON l.id = o.sourcing_line_id
), bid_stats AS (
  SELECT count(*) AS submitted,
    count(*) FILTER (WHERE status = 'accepted') AS won
  FROM bids WHERE platform_supplier_id = p_supplier_id
), contact_stats AS (
  SELECT count(*) AS attempts,
    count(*) FILTER (WHERE status IN ('connected', 'answered', 'sent', 'delivered', 'completed')) AS responses
  FROM supplier_contact_attempts WHERE platform_supplier_id = p_supplier_id
), outcome_stats AS (
  SELECT count(DISTINCT purchase_order_id) FILTER (WHERE type IN ('delivered', 'quality_accepted')) AS positive,
    count(DISTINCT purchase_order_id) FILTER (WHERE type IN ('quality_rejected', 'cancelled', 'disputed')) AS negative
  FROM purchase_order_outcomes WHERE platform_supplier_id = p_supplier_id
), latest_score AS (
  SELECT * FROM supplier_score_snapshots WHERE platform_supplier_id = p_supplier_id ORDER BY version DESC LIMIT 1
), demand AS (
  SELECT c.name AS category,
    count(DISTINCT l.id) FILTER (WHERE l.created_at >= now() - interval '30 days') AS current_count,
    count(DISTINCT l.id) FILTER (WHERE l.created_at >= now() - interval '60 days' AND l.created_at < now() - interval '30 days') AS previous_count
  FROM supplier_capabilities sc
  JOIN categories c ON c.id = sc.category_id
  LEFT JOIN sourcing_lines l ON l.category_id = sc.category_id
  WHERE sc.platform_supplier_id = p_supplier_id
  GROUP BY c.id, c.name ORDER BY current_count DESC, c.name LIMIT 8
)
SELECT jsonb_build_object(
  'totalOpportunities', os.total,
  'activeOpportunities', os.active,
  'bidsSubmitted', bs.submitted,
  'bidsWon', bs.won,
  'responseRate', CASE WHEN cs.attempts = 0 THEN NULL ELSE round(100.0 * cs.responses / cs.attempts, 1) END,
  'bidConversionRate', CASE WHEN os.total = 0 THEN NULL ELSE round(100.0 * bs.submitted / os.total, 1) END,
  'winRate', CASE WHEN bs.submitted = 0 THEN NULL ELSE round(100.0 * bs.won / bs.submitted, 1) END,
  'fulfillmentRate', CASE WHEN (outs.positive + outs.negative) = 0 THEN NULL ELSE round(100.0 * outs.positive / (outs.positive + outs.negative), 1) END,
  'score', CASE WHEN ls.id IS NULL THEN NULL ELSE jsonb_build_object(
    'overall', ls.overall_score, 'response', ls.response_score, 'price', ls.price_score,
    'leadTime', ls.lead_time_score, 'fulfillment', ls.fulfillment_score,
    'compliance', ls.compliance_score, 'sampleSize', ls.sample_size, 'version', ls.version
  ) END,
  'categoryDemand', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'category', category, 'opportunities30d', current_count, 'previous30d', previous_count,
    'changePercent', CASE WHEN previous_count = 0 THEN NULL ELSE round(100.0 * (current_count - previous_count) / previous_count, 1) END
  )) FROM demand), '[]'::jsonb)
)
FROM opportunity_stats os CROSS JOIN bid_stats bs CROSS JOIN contact_stats cs CROSS JOIN outcome_stats outs LEFT JOIN latest_score ls ON true;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION refresh_supplier_score(uuid), refresh_price_benchmark(uuid,text,text,text), supplier_network_insights(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_supplier_score(uuid), supplier_network_insights(uuid) TO vprocly_app;
--> statement-breakpoint

SELECT refresh_supplier_score(id) FROM platform_suppliers;
--> statement-breakpoint
