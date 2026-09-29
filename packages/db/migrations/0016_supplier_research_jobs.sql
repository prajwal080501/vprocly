CREATE TABLE sourcing_research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  sourcing_line_id uuid NOT NULL UNIQUE REFERENCES sourcing_lines(id),
  status text NOT NULL DEFAULT 'queued',
  target_count integer NOT NULL DEFAULT 5,
  found_count integer NOT NULL DEFAULT 0,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sourcing_research_jobs_status_check
    CHECK (status IN ('queued', 'researching', 'completed', 'partial', 'failed')),
  CONSTRAINT sourcing_research_jobs_counts_check
    CHECK (target_count > 0 AND found_count >= 0 AND attempt_count >= 0)
);
--> statement-breakpoint
CREATE INDEX sourcing_research_jobs_status_idx ON sourcing_research_jobs (tenant_id, status);
--> statement-breakpoint
ALTER TABLE sourcing_research_jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sourcing_research_jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sourcing_research_jobs
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sourcing_research_jobs TO vprocly_app;
--> statement-breakpoint

-- Existing lines predate durable research progress. Backfill a terminal snapshot rather than leaving their
-- UIs polling forever: complete at five, partial with any suppliers, failed with an actionable retry otherwise.
INSERT INTO sourcing_research_jobs (
  tenant_id, sourcing_line_id, status, target_count, found_count, last_error, completed_at
)
SELECT
  l.tenant_id,
  l.id,
  CASE
    WHEN count(n.id) >= 5 THEN 'completed'
    WHEN count(n.id) > 0 THEN 'partial'
    ELSE 'failed'
  END,
  5,
  least(count(n.id)::integer, 5),
  CASE WHEN count(n.id) = 0 THEN 'No research result is recorded for this existing line. Retry to start research.' END,
  now()
FROM sourcing_lines l
LEFT JOIN sourcing_line_notifications n ON n.sourcing_line_id = l.id
GROUP BY l.tenant_id, l.id;
