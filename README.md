# vProcly

Procurement, finance control and ExceptionOS. Architecture: [docs/vprocly_procurement_finance_onprem_architecture.pdf](docs/vprocly_procurement_finance_onprem_architecture.pdf).

Status: **Sprint 0 (foundation)** plus a **Phase A pivot**: a BOM-to-bid sourcing marketplace (see [docs/plans/mvp-bidding-marketplace.md](docs/plans/mvp-bidding-marketplace.md)), which now takes priority over the original Sprint 1 plan. Sprint 0 covers tenancy, identity, audit, events, document storage with virus scanning, durable workflows (Temporal), packaging and CI, with suppliers as the reference module. Phase A adds BOM upload/manual entry, category+location supplier matching, blind-bid supplier invites and self-signup, and a wallet.

## Layout

```
apps/api            NestJS modular monolith (REST, OpenAPI at /api/docs)
apps/worker         Outbox relay → NATS JetStream, idempotent consumers, dead-letter queue,
                    virus scanning (ClamAV), Temporal workflows, supplier invite emails
apps/web            Next.js app (Keycloak sign-in via next-auth; buyer pages server-authenticated,
                    /supplier/invite pages public)
services/excel      Python FastAPI Excel service (workbook inspection + full-row /parse for BOM import)
packages/db         Drizzle schema, SQL migrations (RLS, audit, outbox), tenant-scoped DB helpers
packages/contracts  Versioned event schemas and shared enums
packages/config     Shared TypeScript config
infra/compose       Local dev stack
infra/docker        Node service Dockerfile (api, worker)
infra/helm/vprocly  One chart for hosted SaaS now and on-prem later
```

## Run locally

Requires Node 24+, pnpm 11, Docker, Python 3.12+.

```sh
pnpm install
pnpm stack:up                          # Postgres, Keycloak, NATS, Temporal, S3 (SeaweedFS), ClamAV, Redis, Mailpit
                                       # ClamAV downloads signatures on first start (a few minutes)
pnpm build
pnpm db:migrate && pnpm --filter @vprocly/db seed:dev
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev                               # api :4000, worker, web :3000
```

Excel service: `cd services/excel && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/uvicorn app.main:app --port 8001` (or `docker compose -f infra/compose/docker-compose.yml up -d excel`, a containerized copy on port 58001 for CI or a no-setup option; the two never collide).

Dev users (password `password`): `alice` (Acme, requester), `bob` (Acme, approver/buyer/finance/admin), `carol` (Globex, requester/admin). Suppliers self-register through an emailed invite link (see below) — there is no dev supplier user.

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API docs | http://localhost:4000/api/docs |
| Keycloak admin | http://localhost:58080 (admin/admin) |
| Temporal UI | http://localhost:58233 |
| Mailpit | http://localhost:58025 |
| Postgres | localhost:55432 (`vprocly_admin` owner, `vprocly_app` app role) |

## Document lifecycle

`pending_upload` → (client PUTs to a presigned URL, then calls complete) → `pending_scan` → `clean` or `infected`. An upload that isn't completed before its deadline (1 hour by default) becomes `expired`.

- Uploads land in the quarantine bucket. The worker streams each file to clamd. Clean files move to the documents bucket; infected files stay in quarantine and their signature is recorded.
- Download links (5 minutes) are issued only for `clean` documents, and every issued link is audited.
- Deadlines run as Temporal workflows (`uploadDeadlineWorkflow`). They are started and signalled from outbox events, so a Temporal outage delays them but never loses them.

## Sourcing marketplace (Phase A)

A buyer posts items — by uploading a BOM (a fixed CSV/XLSX template, downloadable from the "New sourcing
request" page) or entering them manually — and the platform matches suppliers by category and location,
then emails each one an invite link. See [docs/plans/mvp-bidding-marketplace.md](docs/plans/mvp-bidding-marketplace.md) for the full design and what's still deferred (bid submission, wallet debits, buyer accept/reveal — Phases B/C).

- **Matching is category-required, location-ranked-not-filtered**: any active supplier in the category is
  matched, ranked by exact city then exact state, capped at 10 per line. A thin early supplier pool still
  gets notified even outside their exact city — deliberate, not a bug.
- **Blind-bid rule**: the invite email and the `/supplier/invite/:token` page never contain the buyer's
  identity — only the item, quantity, delivery location and category. Enforced at the database layer: the
  lookup runs through a `SECURITY DEFINER` SQL function (`resolve_sourcing_line_invite`, migration 0006)
  that can only ever return those specific columns, the same pattern already used for the outbox relay.
- **Suppliers are platform-level, not tenant-scoped** (`platform_suppliers`, no RLS — see
  `packages/db/src/schema/marketplace.ts`): the same supplier bids across many buyer tenants. A buyer's own
  `suppliers` vendor-master table stays private and gets a row once a bid is accepted (Phase C).
- **Invite tokens are generated only when the email is actually sent** (in the worker, not the API): a raw
  token never sits in the durable, replayable outbox/event payload — only its hash is ever persisted.
- **Wallet**: 1000 points free on signup, no real-money top-up yet (flagged legal/regulatory risk, see the
  plan doc). The balance can never go negative — enforced by a database check constraint, not just app code.
- Supplier logins use the same Keycloak realm and client as buyers, just with a `platform_supplier_id`
  attribute instead of `tenant_id` — one fewer issuer to manage, same security guarantee (`AuthGuard` forks
  on which claim is present).

## Tests

`pnpm test` runs integration tests against the dev stack, with real Postgres, Keycloak tokens, NATS, S3, ClamAV and Temporal. The Python tests are in `services/excel` and run with `pytest`.

**Turbo + CI env vars, a gotcha:** Turborepo passes through the whole environment when run locally, but when it detects CI it only passes a task's `env` list from `turbo.json` — anything else is silently dropped, and the code falls back to its default with no error. This bit `EXCEL_SERVICE_URL`/`S3_EXCEL_ENDPOINT` once already (worked everywhere locally, silently used the wrong port only in CI). If a test needs a CI-specific env override, add it to `test.env` in `turbo.json`, not just the workflow file. Force-reproduce locally with `CI=true pnpm test`.

What the tests prove:
- **Tenant isolation:** row-level security blocks cross-tenant reads, writes and updates, and a query with no tenant context sees nothing.
- **Audit trail:** the audit log is append-only for the app role and hash-chained per tenant, and chain verification passes.
- **Atomic writes:** a write, its audit record and its outbox event commit in one transaction.
- **Event delivery:** the relay publishes events, JetStream drops duplicate publishes, consumers are idempotent and roll back on failure, and poison events go to the dead-letter queue.
- **Virus scanning:** real ClamAV detects the EICAR test file (kept in quarantine), clean files are released, and redelivery is a no-op.
- **Workflows:** the upload deadline expires abandoned uploads, stops early when the upload completes, and starts only once per upload.
- **API security:** roles are enforced, input is validated, and uploads go into quarantine with size and hash checks.
- **Sourcing marketplace:** category+location matching, BOM template validation (missing/unrecognized columns, row errors, unknown categories — none of which commit anything), the blind-bid rule (asserted directly on the HTTP response body), wallet grant, invite replay protection, and that a signed-up supplier's token carries no `tenant_id`.

## Rules every module follows

- Tenant data is accessed only through `TenantDb.run(ctx, …)` / `withTenant`. RLS is the backstop.
- A write, its `AuditService.record` call and its `EventsService.emit` call share one transaction. `SuppliersService` is the reference.
- Modules import each other only through `index.ts`, enforced by ESLint in `apps/api`.
- Event payloads are versioned in `packages/contracts`. Add a new version rather than changing an existing one.
- The Excel service never writes to live tables and never executes macros.

## Deviations from the blueprint (and why)

| Blueprint | Now | Reason |
|---|---|---|
| MinIO | SeaweedFS locally (any S3 API in prod) | MinIO no longer publishes community images. The app only uses the S3 API. |
| — | TypeScript 6.0 | typescript-eslint does not support TS 7 yet. |
| — | next-auth v4 | Stable line with Next 16 support. Tokens stay server-side in the encrypted cookie. |
| NestJS worker | Plain Node worker | The relay, consumers and a Temporal worker don't need Nest's DI. |
| — | Debian slim Node images | The Temporal native core does not support Alpine/musl. |
| clamav/clamav | clamav/clamav-debian | The same official project; this variant is multi-arch (arm64 + amd64). |
| — | Scoped `vprocly-admin-api` service-account client | Creates supplier Keycloak users via `realm-management: manage-users, view-realm` on this realm only, not master-realm admin credentials. |
| — | `S3_EXCEL_ENDPOINT` (optional) | When the Excel service runs in a different network context than the API (e.g. containerized in CI, reached via `host.docker.internal`, while the API runs natively), it needs its own presigned-URL endpoint — a URL's signature covers the host, so this can't be fixed by editing the URL after signing. Unset in normal deployments where both share reachability. |

**Known gap:** if the API commits a supplier signup but the Keycloak call to create their login then fails
(rare — e.g. Keycloak is down), the supplier row is stuck with a placeholder `keycloakSubject`. This is
visible and repairable (not a silent orphan in Keycloak, which the reverse order would risk), but there is
no automatic retry yet — a reconciliation job is a Phase B follow-up, the same class of gap the original
blueprint's own metrics anticipated ("unreconciled synchronization records").

## Production database prerequisites

The DBA creates the `vprocly_app` login role (no `BYPASSRLS`, not the owner) and the `vector` and `pgcrypto` extensions (see [infra/compose/postgres/init.sql](infra/compose/postgres/init.sql)). Migrations run as the owner role through the Helm pre-install/upgrade Job.
