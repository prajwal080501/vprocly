ALTER TABLE suppliers ADD COLUMN platform_supplier_id uuid REFERENCES platform_suppliers(id);
--> statement-breakpoint
ALTER TABLE suppliers ADD CONSTRAINT suppliers_tenant_id_platform_supplier_id_unique UNIQUE (tenant_id, platform_supplier_id);
--> statement-breakpoint

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  po_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  sourcing_line_id uuid NOT NULL UNIQUE REFERENCES sourcing_lines(id),
  accepted_bid_id uuid NOT NULL UNIQUE REFERENCES bids(id),
  description text NOT NULL,
  qty numeric(14, 3) NOT NULL,
  uom text NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  currency text NOT NULL,
  delivery_city text NOT NULL,
  delivery_state text NOT NULL,
  need_by date,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_tenant_id_po_number_unique UNIQUE (tenant_id, po_number)
);
--> statement-breakpoint
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON purchase_orders
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_orders TO vprocly_app;
--> statement-breakpoint

CREATE FUNCTION list_supplier_bid_activity(p_platform_supplier_id uuid)
RETURNS TABLE (
  bid_id uuid, sourcing_line_id uuid, item_code text, description text, qty numeric, uom text,
  delivery_city text, delivery_state text, need_by date, unit_price numeric,
  minimum_order_qty numeric, lead_time_days integer, notes text, bid_status text,
  buyer_name text, buyer_contact_name text, buyer_contact_email text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, l.id, l.item_code, l.description, l.qty, l.uom,
         l.delivery_city, l.delivery_state, l.need_by, b.unit_price,
         b.minimum_order_qty, b.lead_time_days, b.notes, b.status,
         CASE WHEN b.status = 'accepted' THEN t.name ELSE NULL END,
         CASE WHEN b.status = 'accepted' THEN u.display_name ELSE NULL END,
         CASE WHEN b.status = 'accepted' THEN u.email ELSE NULL END
  FROM bids b
  JOIN sourcing_lines l ON l.id = b.sourcing_line_id
  JOIN sourcing_requests r ON r.id = l.sourcing_request_id
  JOIN tenants t ON t.id = l.tenant_id
  LEFT JOIN users u ON u.id = r.created_by
  WHERE b.platform_supplier_id = p_platform_supplier_id
  ORDER BY b.updated_at DESC
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION list_supplier_bid_activity(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION list_supplier_bid_activity(uuid) TO vprocly_app;
