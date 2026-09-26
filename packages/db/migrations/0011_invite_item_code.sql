-- Adds item_code to what a supplier can see before their bid is accepted (still never the buyer's identity
-- -- see migration 0006's header comment for why this function exists at all). CREATE OR REPLACE cannot
-- change a function's return columns in Postgres, so this drops and recreates it.

DROP FUNCTION IF EXISTS resolve_sourcing_line_invite(text);
--> statement-breakpoint

CREATE FUNCTION resolve_sourcing_line_invite(p_token_hash text)
RETURNS TABLE (
  email text, consumed boolean, item_code text, description text, qty numeric, uom text,
  category_id uuid, delivery_city text, delivery_state text, need_by date
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT n.email, n.consumed_at IS NOT NULL, l.item_code, l.description, l.qty, l.uom, l.category_id, l.delivery_city, l.delivery_state, l.need_by
  FROM sourcing_line_notifications n
  JOIN sourcing_lines l ON l.id = n.sourcing_line_id
  WHERE n.token_hash = p_token_hash AND n.expires_at > now()
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION resolve_sourcing_line_invite(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_sourcing_line_invite(text) TO vprocly_app;
