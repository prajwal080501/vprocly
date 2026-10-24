ALTER TABLE bids ADD COLUMN currency text NOT NULL DEFAULT 'INR';
--> statement-breakpoint
ALTER TABLE bids ADD COLUMN tax_percent numeric(6,3);
--> statement-breakpoint
ALTER TABLE bids ADD COLUMN freight_amount numeric(14,2);
--> statement-breakpoint
ALTER TABLE bids ADD COLUMN quote_validity_date date;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION submit_supplier_bid(
  p_platform_supplier_id uuid, p_sourcing_line_id uuid, p_unit_price numeric,
  p_minimum_order_qty numeric, p_lead_time_days integer, p_notes text
)
RETURNS TABLE (id uuid, is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
  v_line_status text;
  v_currency text;
  v_existing_id uuid;
  v_id uuid;
BEGIN
  SELECT l.tenant_id, l.status, t.default_currency INTO v_tenant_id, v_line_status, v_currency
  FROM sourcing_lines l JOIN tenants t ON t.id = l.tenant_id WHERE l.id = p_sourcing_line_id;
  IF v_tenant_id IS NULL OR v_line_status <> 'open' THEN RAISE EXCEPTION 'line_not_open'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sourcing_line_notifications WHERE sourcing_line_id = p_sourcing_line_id AND platform_supplier_id = p_platform_supplier_id) THEN RAISE EXCEPTION 'not_matched'; END IF;
  SELECT bids.id INTO v_existing_id FROM bids WHERE sourcing_line_id = p_sourcing_line_id AND platform_supplier_id = p_platform_supplier_id;
  INSERT INTO bids (sourcing_line_id, platform_supplier_id, tenant_id, unit_price, minimum_order_qty, lead_time_days, currency, notes)
  VALUES (p_sourcing_line_id, p_platform_supplier_id, v_tenant_id, p_unit_price, p_minimum_order_qty, p_lead_time_days, v_currency, p_notes)
  ON CONFLICT (sourcing_line_id, platform_supplier_id) DO UPDATE SET
    unit_price = EXCLUDED.unit_price, minimum_order_qty = EXCLUDED.minimum_order_qty,
    lead_time_days = EXCLUDED.lead_time_days, currency = EXCLUDED.currency, notes = EXCLUDED.notes, updated_at = now()
  RETURNING bids.id INTO v_id;
  RETURN QUERY SELECT v_id, (v_existing_id IS NULL);
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION record_bid_revision()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision integer;
  v_source text;
  v_source_draft_id uuid;
BEGIN
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision FROM bid_revisions WHERE bid_id = NEW.id;
  v_source := COALESCE(NULLIF(current_setting('app.bid_source', true), ''), 'portal');
  v_source_draft_id := NULLIF(current_setting('app.bid_source_draft_id', true), '')::uuid;
  INSERT INTO bid_revisions (
    tenant_id, bid_id, sourcing_line_id, platform_supplier_id, revision_number, source, source_draft_id,
    unit_price, minimum_order_qty, lead_time_days, currency, tax_percent, freight_amount, quote_validity_date, notes
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.sourcing_line_id, NEW.platform_supplier_id, v_revision, v_source, v_source_draft_id,
    NEW.unit_price, NEW.minimum_order_qty, NEW.lead_time_days, NEW.currency, NEW.tax_percent,
    NEW.freight_amount, NEW.quote_validity_date, NEW.notes
  );
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION confirm_voice_bid(
  p_token_hash text, p_unit_price numeric, p_minimum_order_qty numeric, p_lead_time_days integer,
  p_currency text, p_tax_percent numeric, p_freight_amount numeric, p_quote_validity_date date, p_notes text
)
RETURNS TABLE (bid_id uuid, draft_id uuid, is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_draft bid_drafts%ROWTYPE;
  v_existing_id uuid;
  v_bid_id uuid;
BEGIN
  SELECT * INTO v_draft FROM bid_drafts WHERE confirmation_token_hash = p_token_hash FOR UPDATE;
  IF v_draft.id IS NULL OR v_draft.confirmation_expires_at <= now() THEN RAISE EXCEPTION 'confirmation_expired'; END IF;
  IF v_draft.status = 'confirmed' THEN
    SELECT id INTO v_bid_id FROM bids WHERE sourcing_line_id = v_draft.sourcing_line_id AND platform_supplier_id = v_draft.platform_supplier_id;
    RETURN QUERY SELECT v_bid_id, v_draft.id, false;
    RETURN;
  END IF;
  IF p_unit_price IS NULL OR p_unit_price <= 0 OR p_lead_time_days IS NULL OR p_lead_time_days <= 0 THEN RAISE EXCEPTION 'incomplete_bid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sourcing_lines WHERE id = v_draft.sourcing_line_id AND status = 'open') THEN RAISE EXCEPTION 'line_not_open'; END IF;

  UPDATE bid_drafts SET unit_price = p_unit_price, minimum_order_qty = p_minimum_order_qty,
    lead_time_days = p_lead_time_days, currency = upper(p_currency), tax_percent = p_tax_percent,
    freight_amount = p_freight_amount, quote_validity_date = p_quote_validity_date, notes = p_notes,
    status = 'confirmed', confirmed_at = now(), updated_at = now()
  WHERE id = v_draft.id;

  SELECT id INTO v_existing_id FROM bids WHERE sourcing_line_id = v_draft.sourcing_line_id AND platform_supplier_id = v_draft.platform_supplier_id;
  PERFORM set_config('app.bid_source', 'voice', true);
  PERFORM set_config('app.bid_source_draft_id', v_draft.id::text, true);
  INSERT INTO bids (
    tenant_id, sourcing_line_id, platform_supplier_id, unit_price, minimum_order_qty, lead_time_days,
    currency, tax_percent, freight_amount, quote_validity_date, notes
  ) VALUES (
    v_draft.tenant_id, v_draft.sourcing_line_id, v_draft.platform_supplier_id, p_unit_price,
    p_minimum_order_qty, p_lead_time_days, upper(p_currency), p_tax_percent, p_freight_amount,
    p_quote_validity_date, p_notes
  )
  ON CONFLICT (sourcing_line_id, platform_supplier_id) DO UPDATE SET
    unit_price = EXCLUDED.unit_price, minimum_order_qty = EXCLUDED.minimum_order_qty,
    lead_time_days = EXCLUDED.lead_time_days, currency = EXCLUDED.currency,
    tax_percent = EXCLUDED.tax_percent, freight_amount = EXCLUDED.freight_amount,
    quote_validity_date = EXCLUDED.quote_validity_date, notes = EXCLUDED.notes,
    status = 'submitted', updated_at = now()
  RETURNING bids.id INTO v_bid_id;
  RETURN QUERY SELECT v_bid_id, v_draft.id, (v_existing_id IS NULL);
END $$;
