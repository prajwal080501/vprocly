-- Tenant isolation, least-privilege grants, append-only audit and outbox relay functions.
-- The app connects as vprocly_app (no BYPASSRLS, not owner). Tenant context is set per transaction with
-- set_config('app.tenant_id', ..., true); without it every tenant-scoped query returns nothing.

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['legal_entities','plants','users','audit_log','outbox','inbox_dedup','documents','suppliers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE applies policies to the owner too; outbox is exempt so the owner-run relay functions see all tenants.
    IF t <> 'outbox' THEN
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END IF;
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants USING (id = app_current_tenant());
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO vprocly_app;
--> statement-breakpoint
GRANT SELECT ON tenants TO vprocly_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON legal_entities, plants, users, documents, suppliers TO vprocly_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log, outbox, inbox_dedup TO vprocly_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE audit_log_id_seq TO vprocly_app;
--> statement-breakpoint

-- Audit log is append-only for everyone, including the owner.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint

-- Appends one audit record for the current tenant, chaining its hash to the previous record.
-- A per-tenant advisory lock serializes writers so the chain has no forks.
CREATE OR REPLACE FUNCTION audit_append(
  p_actor_id uuid, p_actor_type text, p_action text, p_entity_type text, p_entity_id text,
  p_correlation_id uuid, p_data jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_tenant uuid := app_current_tenant();
  v_prev text;
  v_at timestamptz := clock_timestamp();
  v_hash text;
  v_id bigint;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'audit_append requires app.tenant_id';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('audit:' || v_tenant::text, 0));
  SELECT hash INTO v_prev FROM audit_log WHERE tenant_id = v_tenant ORDER BY id DESC LIMIT 1;
  v_hash := encode(digest(concat_ws('|',
      coalesce(v_prev, ''), v_tenant::text, to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      coalesce(p_actor_id::text, ''), p_actor_type, p_action, p_entity_type, p_entity_id,
      coalesce(p_correlation_id::text, ''), coalesce(p_data, '{}'::jsonb)::text
    ), 'sha256'), 'hex');
  INSERT INTO audit_log (tenant_id, occurred_at, actor_id, actor_type, action, entity_type, entity_id,
                         correlation_id, data, prev_hash, hash)
  VALUES (v_tenant, v_at, p_actor_id, p_actor_type, p_action, p_entity_type, p_entity_id,
          p_correlation_id, coalesce(p_data, '{}'::jsonb), v_prev, v_hash)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
--> statement-breakpoint

-- Recomputes the chain for the current tenant; returns the id of the first broken record, or NULL.
CREATE OR REPLACE FUNCTION audit_verify_chain() RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE
  r audit_log%ROWTYPE;
  v_prev text := NULL;
  v_expected text;
BEGIN
  FOR r IN SELECT * FROM audit_log WHERE tenant_id = app_current_tenant() ORDER BY id LOOP
    v_expected := encode(digest(concat_ws('|',
        coalesce(v_prev, ''), r.tenant_id::text, to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        coalesce(r.actor_id::text, ''), r.actor_type, r.action, r.entity_type, r.entity_id,
        coalesce(r.correlation_id::text, ''), r.data::text
      ), 'sha256'), 'hex');
    IF r.prev_hash IS DISTINCT FROM v_prev OR r.hash <> v_expected THEN
      RETURN r.id;
    END IF;
    v_prev := r.hash;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint

-- Outbox relay functions run as the table owner (SECURITY DEFINER) so the relay can see every tenant's
-- pending events without the app role needing BYPASSRLS. Call them inside one transaction:
-- claim -> publish -> mark published/failed -> commit.
CREATE OR REPLACE FUNCTION outbox_claim(p_limit int) RETURNS SETOF outbox
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM outbox
  WHERE published_at IS NULL AND next_attempt_at <= now()
  ORDER BY occurred_at
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION outbox_mark_published(p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE outbox SET published_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = ANY(p_ids)
$$;
--> statement-breakpoint
-- Exponential backoff capped at 15 minutes.
CREATE OR REPLACE FUNCTION outbox_mark_failed(p_id uuid, p_error text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE outbox
  SET attempts = attempts + 1,
      last_error = left(p_error, 2000),
      next_attempt_at = now() + least(interval '15 minutes', interval '1 second' * power(2, attempts))
  WHERE id = p_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_claim(int), outbox_mark_published(uuid[]), outbox_mark_failed(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_claim(int), outbox_mark_published(uuid[]), outbox_mark_failed(uuid, text) TO vprocly_app;
