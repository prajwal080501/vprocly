-- Phase B of the bidding marketplace (docs/plans/mvp-bidding-marketplace.md): suppliers can now log in,
-- see the open lines they were matched to, and submit a price quote, debiting BID_FEE_POINTS once per
-- (line, supplier) the first time they bid on it.

ALTER TABLE platform_suppliers ADD COLUMN country text;
--> statement-breakpoint

CREATE TABLE "bids" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "sourcing_line_id" uuid NOT NULL REFERENCES sourcing_lines(id),
  "platform_supplier_id" uuid NOT NULL REFERENCES platform_suppliers(id),
  "unit_price" numeric(14, 2) NOT NULL,
  "lead_time_days" integer,
  "notes" text,
  "status" text NOT NULL DEFAULT 'submitted',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bids_sourcing_line_id_platform_supplier_id_unique" UNIQUE ("sourcing_line_id", "platform_supplier_id")
);
--> statement-breakpoint

ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bids FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON bids USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON bids TO vprocly_app;
--> statement-breakpoint

-- A supplier acts with no tenant session at all (see resolve_sourcing_line_invite, migration 0006, for the
-- same shape of problem): these bypass RLS deliberately, narrowly, and only for what a supplier is allowed
-- to see/do -- never a general-purpose escape hatch.

CREATE FUNCTION list_open_lines_for_supplier(p_platform_supplier_id uuid)
RETURNS TABLE (
  sourcing_line_id uuid, item_code text, description text, qty numeric, uom text, need_by date,
  already_bid boolean, my_unit_price numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.item_code, l.description, l.qty, l.uom, l.need_by,
         b.id IS NOT NULL, b.unit_price
  FROM sourcing_line_notifications n
  JOIN sourcing_lines l ON l.id = n.sourcing_line_id
  LEFT JOIN bids b ON b.sourcing_line_id = l.id AND b.platform_supplier_id = n.platform_supplier_id
  WHERE n.platform_supplier_id = p_platform_supplier_id AND l.status = 'open'
  ORDER BY l.need_by NULLS LAST, l.id DESC
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION list_open_lines_for_supplier(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION list_open_lines_for_supplier(uuid) TO vprocly_app;
--> statement-breakpoint

CREATE FUNCTION submit_supplier_bid(
  p_platform_supplier_id uuid, p_sourcing_line_id uuid, p_unit_price numeric, p_lead_time_days integer, p_notes text
)
RETURNS TABLE (id uuid, is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
  v_line_status text;
  v_existing_id uuid;
  v_id uuid;
BEGIN
  -- Table-qualified throughout: RETURNS TABLE (id, ...) makes "id" a PL/pgSQL variable in scope for the
  -- whole function body, which collides with sourcing_lines.id/bids.id if left unqualified.
  SELECT l.tenant_id, l.status INTO v_tenant_id, v_line_status FROM sourcing_lines l WHERE l.id = p_sourcing_line_id;
  IF v_tenant_id IS NULL OR v_line_status <> 'open' THEN
    RAISE EXCEPTION 'line_not_open';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sourcing_line_notifications
    WHERE sourcing_line_id = p_sourcing_line_id AND platform_supplier_id = p_platform_supplier_id
  ) THEN
    RAISE EXCEPTION 'not_matched';
  END IF;

  SELECT bids.id INTO v_existing_id FROM bids
  WHERE sourcing_line_id = p_sourcing_line_id AND platform_supplier_id = p_platform_supplier_id;

  INSERT INTO bids (sourcing_line_id, platform_supplier_id, tenant_id, unit_price, lead_time_days, notes)
  VALUES (p_sourcing_line_id, p_platform_supplier_id, v_tenant_id, p_unit_price, p_lead_time_days, p_notes)
  ON CONFLICT (sourcing_line_id, platform_supplier_id)
  DO UPDATE SET unit_price = EXCLUDED.unit_price, lead_time_days = EXCLUDED.lead_time_days, notes = EXCLUDED.notes, updated_at = now()
  RETURNING bids.id INTO v_id;

  RETURN QUERY SELECT v_id, (v_existing_id IS NULL);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION submit_supplier_bid(uuid, uuid, numeric, integer, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION submit_supplier_bid(uuid, uuid, numeric, integer, text) TO vprocly_app;
