-- Marketplace pivot (docs/plans/mvp-bidding-marketplace.md), Phase A.
--
-- sourcing_requests/sourcing_lines/sourcing_line_notifications belong to a tenant: same RLS pattern as every
-- other tenant table. categories/platform_suppliers/supplier_categories/wallet_* have no tenant_id -- a
-- supplier bids across many tenants, so there is nothing to partition RLS on. Those are scoped by the
-- service layer instead (a caller only ever acts as their own platformSupplierId).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sourcing_requests','sourcing_lines','sourcing_line_notifications'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON sourcing_requests, sourcing_lines, sourcing_line_notifications TO vprocly_app;
--> statement-breakpoint

-- Read-only taxonomy: only migrations seed/change it, buyers and suppliers just pick from it.
GRANT SELECT ON categories TO vprocly_app;
--> statement-breakpoint

-- Platform-level marketplace tables: no RLS by design (see header comment).
GRANT SELECT, INSERT, UPDATE ON platform_suppliers, supplier_categories, wallet_ledger, wallet_balances TO vprocly_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE wallet_ledger_id_seq TO vprocly_app;
--> statement-breakpoint

INSERT INTO categories (id, name) VALUES
  (gen_random_uuid(), 'Steel & Metal Products'),
  (gen_random_uuid(), 'Electrical & Wiring'),
  (gen_random_uuid(), 'Mechanical Parts & Fasteners'),
  (gen_random_uuid(), 'Industrial Chemicals'),
  (gen_random_uuid(), 'Packaging Materials'),
  (gen_random_uuid(), 'MRO & Consumables'),
  (gen_random_uuid(), 'Pipes & Fittings'),
  (gen_random_uuid(), 'Bearings & Power Transmission'),
  (gen_random_uuid(), 'Paints & Coatings'),
  (gen_random_uuid(), 'Safety & PPE'),
  (gen_random_uuid(), 'Tools & Machinery'),
  (gen_random_uuid(), 'Logistics & Transport')
ON CONFLICT (name) DO NOTHING;
