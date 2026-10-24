-- Phases 0-3: durable outreach/bid history, voice bid confirmation, supplier passports and fulfillment outcomes.

CREATE TABLE supplier_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  type text NOT NULL,
  value text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, value)
);
--> statement-breakpoint
CREATE INDEX supplier_identifiers_supplier_idx ON supplier_identifiers(platform_supplier_id);
--> statement-breakpoint
CREATE TABLE supplier_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  type text NOT NULL DEFAULT 'service',
  label text,
  address text,
  city text NOT NULL,
  state text NOT NULL,
  country text NOT NULL DEFAULT 'India',
  postal_code text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX supplier_locations_supplier_idx ON supplier_locations(platform_supplier_id);
--> statement-breakpoint
CREATE TABLE supplier_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  description text,
  materials jsonb,
  processes jsonb,
  brands jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_supplier_id, category_id)
);
--> statement-breakpoint
CREATE TABLE supplier_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  name text NOT NULL,
  issuer text,
  certificate_number text,
  expires_at timestamptz,
  verification_status text NOT NULL DEFAULT 'unverified',
  document_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX supplier_certifications_supplier_idx ON supplier_certifications(platform_supplier_id);
--> statement-breakpoint
CREATE TABLE supplier_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  name text,
  role text,
  email text,
  phone text,
  preferred_channel text,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX supplier_contacts_supplier_idx ON supplier_contacts(platform_supplier_id);
--> statement-breakpoint

INSERT INTO supplier_identifiers (platform_supplier_id, type, value)
SELECT id, 'gstin', gst FROM platform_suppliers WHERE gst IS NOT NULL
ON CONFLICT (type, value) DO NOTHING;
--> statement-breakpoint
INSERT INTO supplier_locations (platform_supplier_id, type, city, state, country, is_primary)
SELECT id, 'registered', city, state, COALESCE(country, 'India'), true FROM platform_suppliers;
--> statement-breakpoint
INSERT INTO supplier_contacts (platform_supplier_id, email, phone, preferred_channel, is_primary)
SELECT id, email, phone, CASE WHEN phone IS NOT NULL THEN 'voice' ELSE 'email' END, true FROM platform_suppliers;
--> statement-breakpoint
INSERT INTO supplier_capabilities (platform_supplier_id, category_id)
SELECT platform_supplier_id, category_id FROM supplier_categories
ON CONFLICT (platform_supplier_id, category_id) DO NOTHING;
--> statement-breakpoint

CREATE TABLE supplier_contact_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  notification_id uuid NOT NULL REFERENCES sourcing_line_notifications(id),
  sourcing_line_id uuid NOT NULL REFERENCES sourcing_lines(id),
  platform_supplier_id uuid REFERENCES platform_suppliers(id),
  voice_call_id uuid REFERENCES supplier_voice_calls(id),
  channel text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  purpose text NOT NULL DEFAULT 'rfq',
  status text NOT NULL DEFAULT 'queued',
  provider text,
  provider_attempt_id text,
  metadata jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX supplier_contact_attempts_line_idx ON supplier_contact_attempts(sourcing_line_id);
--> statement-breakpoint
CREATE INDEX supplier_contact_attempts_supplier_idx ON supplier_contact_attempts(platform_supplier_id);
--> statement-breakpoint
CREATE INDEX supplier_contact_attempts_voice_idx ON supplier_contact_attempts(voice_call_id);
--> statement-breakpoint

CREATE TABLE bid_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  sourcing_line_id uuid NOT NULL REFERENCES sourcing_lines(id),
  notification_id uuid NOT NULL REFERENCES sourcing_line_notifications(id),
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  voice_call_id uuid NOT NULL UNIQUE REFERENCES supplier_voice_calls(id),
  unit_price numeric(14,2),
  minimum_order_qty numeric(14,3),
  lead_time_days integer,
  currency text NOT NULL DEFAULT 'INR',
  tax_percent numeric(6,3),
  freight_amount numeric(14,2),
  quote_validity_date date,
  notes text,
  status text NOT NULL DEFAULT 'incomplete',
  extraction_confidence numeric(5,4),
  raw_fields jsonb,
  confirmation_token_hash text UNIQUE,
  confirmation_expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (unit_price IS NULL OR unit_price > 0),
  CHECK (minimum_order_qty IS NULL OR minimum_order_qty > 0),
  CHECK (lead_time_days IS NULL OR lead_time_days > 0)
);
--> statement-breakpoint
CREATE INDEX bid_drafts_line_idx ON bid_drafts(sourcing_line_id);
--> statement-breakpoint
CREATE INDEX bid_drafts_status_idx ON bid_drafts(tenant_id, status);
--> statement-breakpoint

CREATE TABLE bid_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bid_id uuid NOT NULL REFERENCES bids(id),
  sourcing_line_id uuid NOT NULL REFERENCES sourcing_lines(id),
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  revision_number integer NOT NULL,
  source text NOT NULL DEFAULT 'portal',
  source_draft_id uuid REFERENCES bid_drafts(id),
  unit_price numeric(14,2) NOT NULL,
  minimum_order_qty numeric(14,3),
  lead_time_days integer,
  currency text NOT NULL DEFAULT 'INR',
  tax_percent numeric(6,3),
  freight_amount numeric(14,2),
  quote_validity_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bid_id, revision_number)
);
--> statement-breakpoint
CREATE INDEX bid_revisions_line_idx ON bid_revisions(sourcing_line_id);
--> statement-breakpoint

CREATE TABLE purchase_order_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  sourcing_line_id uuid NOT NULL REFERENCES sourcing_lines(id),
  platform_supplier_id uuid NOT NULL REFERENCES platform_suppliers(id),
  type text NOT NULL,
  promised_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  quantity numeric(14,3),
  rating integer,
  reason_code text,
  notes text,
  evidence jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CHECK (quantity IS NULL OR quantity >= 0)
);
--> statement-breakpoint
CREATE INDEX purchase_order_outcomes_po_idx ON purchase_order_outcomes(purchase_order_id);
--> statement-breakpoint
CREATE INDEX purchase_order_outcomes_supplier_idx ON purchase_order_outcomes(platform_supplier_id);
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_contact_attempts','bid_drafts','bid_revisions','purchase_order_outcomes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_contact_attempts, bid_drafts, bid_revisions, purchase_order_outcomes TO vprocly_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_identifiers, supplier_locations, supplier_capabilities, supplier_certifications, supplier_contacts TO vprocly_app;
--> statement-breakpoint
GRANT DELETE ON supplier_categories TO vprocly_app;
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
    unit_price, minimum_order_qty, lead_time_days, notes
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.sourcing_line_id, NEW.platform_supplier_id, v_revision, v_source, v_source_draft_id,
    NEW.unit_price, NEW.minimum_order_qty, NEW.lead_time_days, NEW.notes
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bids_revision_history
AFTER INSERT OR UPDATE OF unit_price, minimum_order_qty, lead_time_days, notes ON bids
FOR EACH ROW EXECUTE FUNCTION record_bid_revision();
--> statement-breakpoint
INSERT INTO bid_revisions (tenant_id, bid_id, sourcing_line_id, platform_supplier_id, revision_number, source, unit_price, minimum_order_qty, lead_time_days, notes, created_at)
SELECT tenant_id, id, sourcing_line_id, platform_supplier_id, 1, 'migration', unit_price, minimum_order_qty, lead_time_days, notes, created_at FROM bids;
--> statement-breakpoint

CREATE FUNCTION resolve_bid_confirmation(p_token_hash text)
RETURNS TABLE (
  draft_id uuid, status text, supplier_name text, item_code text, description text, qty numeric, uom text,
  delivery_city text, delivery_state text, need_by date, unit_price numeric, minimum_order_qty numeric,
  lead_time_days integer, currency text, tax_percent numeric, freight_amount numeric,
  quote_validity_date date, notes text, expires_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.status, s.name, l.item_code, l.description, l.qty, l.uom, l.delivery_city, l.delivery_state,
         l.need_by, d.unit_price, d.minimum_order_qty, d.lead_time_days, d.currency, d.tax_percent,
         d.freight_amount, d.quote_validity_date, d.notes, d.confirmation_expires_at
  FROM bid_drafts d
  JOIN sourcing_lines l ON l.id = d.sourcing_line_id
  JOIN platform_suppliers s ON s.id = d.platform_supplier_id
  WHERE d.confirmation_token_hash = p_token_hash
$$;
--> statement-breakpoint

CREATE FUNCTION confirm_voice_bid(
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
  IF p_unit_price IS NULL OR p_unit_price <= 0 OR p_lead_time_days IS NULL OR p_lead_time_days <= 0 THEN
    RAISE EXCEPTION 'incomplete_bid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sourcing_lines WHERE id = v_draft.sourcing_line_id AND status = 'open') THEN
    RAISE EXCEPTION 'line_not_open';
  END IF;

  UPDATE bid_drafts SET unit_price = p_unit_price, minimum_order_qty = p_minimum_order_qty,
    lead_time_days = p_lead_time_days, currency = upper(p_currency), tax_percent = p_tax_percent,
    freight_amount = p_freight_amount, quote_validity_date = p_quote_validity_date, notes = p_notes,
    status = 'confirmed', confirmed_at = now(), updated_at = now()
  WHERE id = v_draft.id;

  SELECT id INTO v_existing_id FROM bids WHERE sourcing_line_id = v_draft.sourcing_line_id AND platform_supplier_id = v_draft.platform_supplier_id;
  PERFORM set_config('app.bid_source', 'voice', true);
  PERFORM set_config('app.bid_source_draft_id', v_draft.id::text, true);
  INSERT INTO bids (tenant_id, sourcing_line_id, platform_supplier_id, unit_price, minimum_order_qty, lead_time_days, notes)
  VALUES (v_draft.tenant_id, v_draft.sourcing_line_id, v_draft.platform_supplier_id, p_unit_price, p_minimum_order_qty, p_lead_time_days, p_notes)
  ON CONFLICT (sourcing_line_id, platform_supplier_id) DO UPDATE SET
    unit_price = EXCLUDED.unit_price, minimum_order_qty = EXCLUDED.minimum_order_qty,
    lead_time_days = EXCLUDED.lead_time_days, notes = EXCLUDED.notes, status = 'submitted', updated_at = now()
  RETURNING bids.id INTO v_bid_id;
  RETURN QUERY SELECT v_bid_id, v_draft.id, (v_existing_id IS NULL);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_bid_confirmation(text), confirm_voice_bid(text,numeric,numeric,integer,text,numeric,numeric,date,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_bid_confirmation(text), confirm_voice_bid(text,numeric,numeric,integer,text,numeric,numeric,date,text) TO vprocly_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION notify_vprocly_dashboard_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_row record; event_kind text; line_id uuid; tenant_id uuid; supplier_id uuid; event_status text; request_id uuid; item_description text;
BEGIN
  source_row := NEW;
  IF TG_TABLE_NAME = 'sourcing_line_notifications' THEN
    line_id := source_row.sourcing_line_id; tenant_id := source_row.tenant_id; supplier_id := source_row.platform_supplier_id;
    event_kind := CASE WHEN TG_OP = 'UPDATE' AND OLD.sent_at IS DISTINCT FROM NEW.sent_at AND NEW.sent_at IS NOT NULL THEN 'email' ELSE 'opportunity' END;
    event_status := CASE WHEN source_row.sent_at IS NOT NULL THEN 'sent' ELSE 'queued' END;
  ELSIF TG_TABLE_NAME = 'supplier_voice_calls' THEN
    line_id := source_row.sourcing_line_id; tenant_id := source_row.tenant_id; supplier_id := source_row.platform_supplier_id; event_kind := 'call'; event_status := source_row.status;
  ELSIF TG_TABLE_NAME = 'bids' THEN
    line_id := source_row.sourcing_line_id; tenant_id := source_row.tenant_id; supplier_id := source_row.platform_supplier_id; event_kind := 'bid'; event_status := source_row.status;
  ELSIF TG_TABLE_NAME = 'bid_drafts' THEN
    line_id := source_row.sourcing_line_id; tenant_id := source_row.tenant_id; supplier_id := source_row.platform_supplier_id; event_kind := 'bid_draft'; event_status := source_row.status;
  ELSIF TG_TABLE_NAME = 'purchase_order_outcomes' THEN
    line_id := source_row.sourcing_line_id; tenant_id := source_row.tenant_id; supplier_id := source_row.platform_supplier_id; event_kind := 'fulfillment'; event_status := source_row.type;
  ELSIF TG_TABLE_NAME = 'sourcing_research_jobs' THEN
    line_id := source_row.sourcing_line_id; tenant_id := source_row.tenant_id; supplier_id := NULL; event_kind := 'research'; event_status := source_row.status;
  ELSE RETURN source_row;
  END IF;
  SELECT sourcing_request_id, description INTO request_id, item_description FROM sourcing_lines WHERE id = line_id;
  PERFORM pg_notify('vprocly_realtime', json_strip_nulls(json_build_object(
    'kind', event_kind, 'tenantId', tenant_id, 'supplierId', supplier_id, 'sourcingLineId', line_id,
    'sourcingRequestId', request_id, 'itemDescription', item_description, 'status', event_status, 'occurredAt', clock_timestamp()
  ))::text);
  RETURN source_row;
END $$;
--> statement-breakpoint
CREATE TRIGGER bid_drafts_realtime AFTER INSERT OR UPDATE ON bid_drafts FOR EACH ROW EXECUTE FUNCTION notify_vprocly_dashboard_change();
--> statement-breakpoint
CREATE TRIGGER purchase_order_outcomes_realtime AFTER INSERT ON purchase_order_outcomes FOR EACH ROW EXECUTE FUNCTION notify_vprocly_dashboard_change();
