-- Buyer self-signup creates a brand-new tenant, which is inherently a cross-tenant operation: there is no
-- app.tenant_id to scope to before the tenant exists. Same narrow-escape-hatch pattern as outbox_claim
-- (migration 0001) and the sourcing invite functions (migration 0006): SECURITY DEFINER + row_security off,
-- but this function can only ever do one thing -- insert exactly one tenant row, atomically racing against
-- the slug's unique constraint instead of a separate check-then-insert (which would have a TOCTOU race).

CREATE OR REPLACE FUNCTION create_tenant(p_id uuid, p_slug text, p_name text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  INSERT INTO tenants (id, slug, name) VALUES (p_id, p_slug, p_name)
  ON CONFLICT (slug) DO NOTHING;
  RETURN FOUND;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION create_tenant(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION create_tenant(uuid, text, text) TO vprocly_app;
