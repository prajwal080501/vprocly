CREATE OR REPLACE FUNCTION notify_vprocly_dashboard_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_row record;
  event_kind text;
  line_id uuid;
  tenant_id uuid;
  supplier_id uuid;
  event_status text;
  request_id uuid;
  item_description text;
BEGIN
  source_row := NEW;

  IF TG_TABLE_NAME = 'sourcing_line_notifications' THEN
    line_id := source_row.sourcing_line_id;
    tenant_id := source_row.tenant_id;
    supplier_id := source_row.platform_supplier_id;
    event_kind := CASE
      WHEN TG_OP = 'UPDATE' AND OLD.sent_at IS DISTINCT FROM NEW.sent_at AND NEW.sent_at IS NOT NULL THEN 'email'
      ELSE 'opportunity'
    END;
    event_status := CASE WHEN source_row.sent_at IS NOT NULL THEN 'sent' ELSE 'queued' END;
  ELSIF TG_TABLE_NAME = 'supplier_voice_calls' THEN
    line_id := source_row.sourcing_line_id;
    tenant_id := source_row.tenant_id;
    supplier_id := source_row.platform_supplier_id;
    event_kind := 'call';
    event_status := source_row.status;
  ELSIF TG_TABLE_NAME = 'bids' THEN
    line_id := source_row.sourcing_line_id;
    tenant_id := source_row.tenant_id;
    supplier_id := source_row.platform_supplier_id;
    event_kind := 'bid';
    event_status := source_row.status;
  ELSIF TG_TABLE_NAME = 'sourcing_research_jobs' THEN
    line_id := source_row.sourcing_line_id;
    tenant_id := source_row.tenant_id;
    supplier_id := NULL;
    event_kind := 'research';
    event_status := source_row.status;
  ELSE
    RETURN source_row;
  END IF;

  SELECT sourcing_request_id, description
    INTO request_id, item_description
    FROM sourcing_lines
    WHERE id = line_id;

  PERFORM pg_notify(
    'vprocly_realtime',
    json_strip_nulls(json_build_object(
      'kind', event_kind,
      'tenantId', tenant_id,
      'supplierId', supplier_id,
      'sourcingLineId', line_id,
      'sourcingRequestId', request_id,
      'itemDescription', item_description,
      'status', event_status,
      'occurredAt', clock_timestamp()
    ))::text
  );

  RETURN source_row;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sourcing_notifications_realtime ON sourcing_line_notifications;
CREATE TRIGGER sourcing_notifications_realtime
AFTER INSERT OR UPDATE ON sourcing_line_notifications
FOR EACH ROW EXECUTE FUNCTION notify_vprocly_dashboard_change();
--> statement-breakpoint
DROP TRIGGER IF EXISTS supplier_calls_realtime ON supplier_voice_calls;
CREATE TRIGGER supplier_calls_realtime
AFTER INSERT OR UPDATE ON supplier_voice_calls
FOR EACH ROW EXECUTE FUNCTION notify_vprocly_dashboard_change();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sourcing_bids_realtime ON bids;
CREATE TRIGGER sourcing_bids_realtime
AFTER INSERT OR UPDATE ON bids
FOR EACH ROW EXECUTE FUNCTION notify_vprocly_dashboard_change();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sourcing_research_realtime ON sourcing_research_jobs;
CREATE TRIGGER sourcing_research_realtime
AFTER INSERT OR UPDATE ON sourcing_research_jobs
FOR EACH ROW EXECUTE FUNCTION notify_vprocly_dashboard_change();
