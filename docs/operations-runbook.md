# Operations Runbook

## Environments

Production and staging must use separate AWS accounts or, at minimum, separate EC2/RDS resources and SSM paths:

- `/vprocly/prod/env/*`
- `/vprocly/staging/env/*`

Deploy staging with explicit targeting so production defaults cannot be selected accidentally:

```bash
DEPLOY_ENV=staging \
INSTANCE_TAG=vprocly-staging-app \
RDS_INSTANCE_ID=vprocly-staging \
APP_DOMAIN=staging.vprocly.com \
pnpm deploy:aws
```

Keep a seeded staging buyer administrator and supplier account in the identity provider. Store smoke-test credentials in the deployment runner's secret store as `SMOKE_*`; never put them in SSM's shared runtime file or source control. `scripts/smoke-aws.sh` automatically exercises authenticated identity and sourcing-list reads when those values are present.

## Alerts

Set `/vprocly/<environment>/env/OPS_ALERT_WEBHOOK_URL` to an incident-ingestion endpoint. API 5xx responses, worker consumer failures, outbox relay failures, campaign setup failures, migration failures, and readiness rollback failures use this destination. Alert delivery is throttled per failure key for five minutes.

Operations thresholds shown in the application:

- API error rate: unhealthy at 2% over 15 minutes.
- API p95 latency: unhealthy at 1.5 seconds over 15 minutes.
- Outbox: unhealthy above 20 pending events or an oldest age above five minutes.
- Research: delayed after five minutes in `queued` or `researching`.
- Payment reconciliation: `created` after 15 minutes, or `paid` without both a payment id and wallet credit.

## Deployment And Rollback

Application images are immutable and tagged with Git SHA plus UTC timestamp. Before an API deployment, the script creates and waits for an RDS snapshot, then runs backward-compatible migrations using the new API image while the old services remain live. Services switch only after migration succeeds.

The host keeps `.env.pre-deploy` until readiness and process checks pass. A failed migration, process check, or API readiness check restores the previous image set. ECR retains the previous versioned image; `latest` is never used by the active compose release.

## Restore Drill

Run quarterly against staging:

1. Record the newest staging sourcing request and wallet ledger balance.
2. Create a manual RDS snapshot and wait for `available`.
3. Restore it to a new staging-only RDS instance.
4. Point a temporary `/vprocly/restore-drill/env/DATABASE_URL` at the restored database.
5. Deploy API and worker with `DEPLOY_ENV=restore-drill` to an isolated host.
6. Run `scripts/smoke-aws.sh` with seeded credentials.
7. Verify the recorded request, audit-chain endpoint, and wallet balance.
8. Record recovery time and any manual corrections, then destroy the temporary host/database.

A snapshot is not considered verified until this drill succeeds.

## Triage

Start with `/operations`:

1. Check release version and API latency/error rate.
2. Inspect delayed outbox work and failed research jobs.
3. Compare call/email delivery status.
4. Resolve payment mismatches before manually crediting any wallet.
5. Use the sourcing item's Activity tab and correlation id in structured logs to reconstruct the workflow.
