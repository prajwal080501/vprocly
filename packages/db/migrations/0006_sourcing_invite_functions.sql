-- A supplier invite link is looked up by token alone, before we know which tenant it belongs to, so the
-- ordinary tenant-scoped connection (with no app.tenant_id set) cannot see it under FORCE ROW LEVEL SECURITY.
-- These two functions are the narrow, column-limited exception, mirroring outbox_claim/outbox_mark_published
-- in 0001_security.sql: SECURITY DEFINER + row_security off, but each returns/touches only what it must.

-- Never returns tenant_id, sourcing_request_id, or any other buyer-identifying field -- only what a supplier
-- is allowed to see before their bid is accepted (blueprint's blind-bid rule).
CREATE OR REPLACE FUNCTION resolve_sourcing_line_invite(p_token_hash text)
RETURNS TABLE (
  email text, consumed boolean, description text, qty numeric, uom text,
  category_id uuid, delivery_city text, delivery_state text, need_by date
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT n.email, n.consumed_at IS NOT NULL, l.description, l.qty, l.uom, l.category_id, l.delivery_city, l.delivery_state, l.need_by
  FROM sourcing_line_notifications n
  JOIN sourcing_lines l ON l.id = n.sourcing_line_id
  WHERE n.token_hash = p_token_hash AND n.expires_at > now()
$$;
--> statement-breakpoint

-- Marks this invite consumed and links every other pending (not-yet-signed-up) invite for the same email to
-- the new account, across all tenants. Touches only sourcing_line_notifications; never reads or returns any
-- other table.
CREATE OR REPLACE FUNCTION consume_sourcing_line_invite(p_token_hash text, p_platform_supplier_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  SELECT email INTO v_email FROM sourcing_line_notifications WHERE token_hash = p_token_hash AND expires_at > now();
  IF v_email IS NULL THEN
    RETURN false;
  END IF;
  UPDATE sourcing_line_notifications SET platform_supplier_id = p_platform_supplier_id
    WHERE email = v_email AND platform_supplier_id IS NULL;
  UPDATE sourcing_line_notifications SET consumed_at = now() WHERE token_hash = p_token_hash;
  RETURN true;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION resolve_sourcing_line_invite(text), consume_sourcing_line_invite(text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_sourcing_line_invite(text), consume_sourcing_line_invite(text, uuid) TO vprocly_app;
