DROP FUNCTION list_open_lines_for_supplier(uuid);
--> statement-breakpoint
CREATE FUNCTION list_open_lines_for_supplier(p_platform_supplier_id uuid)
RETURNS TABLE (
  sourcing_line_id uuid, item_code text, description text, qty numeric, uom text, need_by date,
  already_bid boolean, my_unit_price numeric, my_minimum_order_qty numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH supplier_identity AS (
    SELECT email FROM platform_suppliers WHERE id = p_platform_supplier_id
  ), eligible_lines AS (
    SELECT DISTINCT n.sourcing_line_id
    FROM sourcing_line_notifications n
    CROSS JOIN supplier_identity s
    WHERE n.platform_supplier_id = p_platform_supplier_id
       OR lower(n.email) = lower(s.email)
  )
  SELECT l.id, l.item_code, l.description, l.qty, l.uom, l.need_by,
         b.id IS NOT NULL, b.unit_price, b.minimum_order_qty
  FROM eligible_lines e
  JOIN sourcing_lines l ON l.id = e.sourcing_line_id
  LEFT JOIN bids b ON b.sourcing_line_id = l.id AND b.platform_supplier_id = p_platform_supplier_id
  WHERE l.status = 'open'
  ORDER BY l.need_by NULLS LAST, l.id DESC
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION list_open_lines_for_supplier(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION list_open_lines_for_supplier(uuid) TO vprocly_app;
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
  v_existing_id uuid;
  v_id uuid;
BEGIN
  SELECT l.tenant_id, l.status INTO v_tenant_id, v_line_status FROM sourcing_lines l WHERE l.id = p_sourcing_line_id;
  IF v_tenant_id IS NULL OR v_line_status <> 'open' THEN
    RAISE EXCEPTION 'line_not_open';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM sourcing_line_notifications n
    JOIN platform_suppliers s ON s.id = p_platform_supplier_id
    WHERE n.sourcing_line_id = p_sourcing_line_id
      AND (n.platform_supplier_id = p_platform_supplier_id OR lower(n.email) = lower(s.email))
  ) THEN
    RAISE EXCEPTION 'not_matched';
  END IF;

  SELECT bids.id INTO v_existing_id FROM bids
  WHERE sourcing_line_id = p_sourcing_line_id AND platform_supplier_id = p_platform_supplier_id;

  INSERT INTO bids (sourcing_line_id, platform_supplier_id, tenant_id, unit_price, minimum_order_qty, lead_time_days, notes)
  VALUES (p_sourcing_line_id, p_platform_supplier_id, v_tenant_id, p_unit_price, p_minimum_order_qty, p_lead_time_days, p_notes)
  ON CONFLICT (sourcing_line_id, platform_supplier_id)
  DO UPDATE SET unit_price = EXCLUDED.unit_price, minimum_order_qty = EXCLUDED.minimum_order_qty,
                lead_time_days = EXCLUDED.lead_time_days, notes = EXCLUDED.notes, updated_at = now()
  RETURNING bids.id INTO v_id;

  RETURN QUERY SELECT v_id, (v_existing_id IS NULL);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION submit_supplier_bid(uuid, uuid, numeric, numeric, integer, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION submit_supplier_bid(uuid, uuid, numeric, numeric, integer, text) TO vprocly_app;
