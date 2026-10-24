CREATE TABLE "item_clarification_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sourcing_line_id" uuid NOT NULL,
	"platform_supplier_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"sender_user_id" uuid,
	"sender_label" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_clarification_messages_sender_check" CHECK (sender_type IN ('buyer', 'supplier')),
	CONSTRAINT "item_clarification_messages_body_check" CHECK (length(btrim(body)) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "supplier_line_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sourcing_line_id" uuid NOT NULL,
	"platform_supplier_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_line_responses_sourcing_line_id_platform_supplier_id_unique" UNIQUE("sourcing_line_id","platform_supplier_id"),
	CONSTRAINT "supplier_line_responses_status_check" CHECK (status IN ('can_supply', 'needs_clarification', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "item_clarification_messages" ADD CONSTRAINT "item_clarification_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "item_clarification_messages" ADD CONSTRAINT "item_clarification_messages_sourcing_line_id_sourcing_lines_id_fk" FOREIGN KEY ("sourcing_line_id") REFERENCES "public"."sourcing_lines"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "item_clarification_messages" ADD CONSTRAINT "item_clarification_messages_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "supplier_line_responses" ADD CONSTRAINT "supplier_line_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "supplier_line_responses" ADD CONSTRAINT "supplier_line_responses_sourcing_line_id_sourcing_lines_id_fk" FOREIGN KEY ("sourcing_line_id") REFERENCES "public"."sourcing_lines"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "supplier_line_responses" ADD CONSTRAINT "supplier_line_responses_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "item_clarification_messages_thread_idx" ON "item_clarification_messages" USING btree ("sourcing_line_id","platform_supplier_id","created_at");
CREATE INDEX "item_clarification_messages_tenant_idx" ON "item_clarification_messages" USING btree ("tenant_id","created_at");
CREATE INDEX "supplier_line_responses_line_idx" ON "supplier_line_responses" USING btree ("sourcing_line_id");
CREATE INDEX "supplier_line_responses_supplier_idx" ON "supplier_line_responses" USING btree ("platform_supplier_id");
--> statement-breakpoint
ALTER TABLE item_clarification_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_clarification_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_clarification_messages USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, DELETE ON item_clarification_messages TO vprocly_app;
ALTER TABLE supplier_line_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_line_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON supplier_line_responses USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_line_responses TO vprocly_app;
--> statement-breakpoint
CREATE FUNCTION supplier_has_line_access(p_platform_supplier_id uuid, p_sourcing_line_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sourcing_line_notifications n
    JOIN platform_suppliers s ON s.id = p_platform_supplier_id
    WHERE n.sourcing_line_id = p_sourcing_line_id
      AND (n.platform_supplier_id = p_platform_supplier_id OR lower(n.email) = lower(s.email))
  )
$$;
REVOKE ALL ON FUNCTION supplier_has_line_access(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION list_supplier_item_clarifications(p_platform_supplier_id uuid, p_sourcing_line_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, sourcing_line_id uuid, sender_type text, sender_label text, body text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.sourcing_line_id, m.sender_type, m.sender_label, m.body, m.created_at
  FROM item_clarification_messages m
  WHERE m.platform_supplier_id = p_platform_supplier_id
    AND (p_sourcing_line_id IS NULL OR m.sourcing_line_id = p_sourcing_line_id)
    AND supplier_has_line_access(p_platform_supplier_id, m.sourcing_line_id)
  ORDER BY m.created_at, m.id
$$;
--> statement-breakpoint
CREATE FUNCTION post_supplier_item_clarification(p_platform_supplier_id uuid, p_sourcing_line_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid; v_id uuid; v_supplier_name text;
BEGIN
  IF NOT supplier_has_line_access(p_platform_supplier_id, p_sourcing_line_id) THEN RAISE EXCEPTION 'not_matched'; END IF;
  IF length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'invalid_message'; END IF;
  SELECT tenant_id INTO v_tenant_id FROM sourcing_lines WHERE id = p_sourcing_line_id;
  SELECT name INTO v_supplier_name FROM platform_suppliers WHERE id = p_platform_supplier_id;
  INSERT INTO item_clarification_messages (tenant_id, sourcing_line_id, platform_supplier_id, sender_type, sender_label, body)
  VALUES (v_tenant_id, p_sourcing_line_id, p_platform_supplier_id, 'supplier', COALESCE(v_supplier_name, 'Supplier'), btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
--> statement-breakpoint
CREATE FUNCTION list_supplier_line_responses(p_platform_supplier_id uuid)
RETURNS TABLE (sourcing_line_id uuid, status text, reason text, responded_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.sourcing_line_id, r.status, r.reason, r.responded_at
  FROM supplier_line_responses r
  WHERE r.platform_supplier_id = p_platform_supplier_id
    AND supplier_has_line_access(p_platform_supplier_id, r.sourcing_line_id)
$$;
--> statement-breakpoint
CREATE FUNCTION set_supplier_line_response(p_platform_supplier_id uuid, p_sourcing_line_id uuid, p_status text, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid; v_id uuid;
BEGIN
  IF NOT supplier_has_line_access(p_platform_supplier_id, p_sourcing_line_id) THEN RAISE EXCEPTION 'not_matched'; END IF;
  IF p_status NOT IN ('can_supply', 'needs_clarification', 'declined') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT tenant_id INTO v_tenant_id FROM sourcing_lines WHERE id = p_sourcing_line_id;
  INSERT INTO supplier_line_responses (tenant_id, sourcing_line_id, platform_supplier_id, status, reason, responded_at)
  VALUES (v_tenant_id, p_sourcing_line_id, p_platform_supplier_id, p_status, NULLIF(btrim(p_reason), ''), now())
  ON CONFLICT (sourcing_line_id, platform_supplier_id) DO UPDATE SET
    status = EXCLUDED.status, reason = EXCLUDED.reason, responded_at = now(), updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION list_supplier_item_clarifications(uuid, uuid), post_supplier_item_clarification(uuid, uuid, text), list_supplier_line_responses(uuid), set_supplier_line_response(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_supplier_item_clarifications(uuid, uuid), post_supplier_item_clarification(uuid, uuid, text), list_supplier_line_responses(uuid), set_supplier_line_response(uuid, uuid, text, text) TO vprocly_app;
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
  ELSIF TG_TABLE_NAME = 'item_clarification_messages' THEN
    line_id := source_row.sourcing_line_id; tenant_id := source_row.tenant_id; supplier_id := source_row.platform_supplier_id; event_kind := 'clarification'; event_status := source_row.sender_type;
  ELSIF TG_TABLE_NAME = 'supplier_line_responses' THEN
    line_id := source_row.sourcing_line_id; tenant_id := source_row.tenant_id; supplier_id := source_row.platform_supplier_id; event_kind := 'capability'; event_status := source_row.status;
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
CREATE TRIGGER item_clarifications_realtime AFTER INSERT ON item_clarification_messages FOR EACH ROW EXECUTE FUNCTION notify_vprocly_dashboard_change();
CREATE TRIGGER supplier_line_responses_realtime AFTER INSERT OR UPDATE ON supplier_line_responses FOR EACH ROW EXECUTE FUNCTION notify_vprocly_dashboard_change();
