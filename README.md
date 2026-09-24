# vProcly

Procurement, finance control and ExceptionOS. Architecture: [docs/vprocly_procurement_finance_onprem_architecture.pdf](docs/vprocly_procurement_finance_onprem_architecture.pdf).

Status: **Sprint 0 (foundation)** of the 18-week MVP plan. Includes tenancy, identity, audit, events, document storage with virus scanning, durable workflows (Temporal), packaging and CI. The first business module (suppliers) is included as the reference pattern.

## Layout

```
apps/api            NestJS modular monolith (REST, OpenAPI at /api/docs)
apps/worker         Outbox relay → NATS JetStream, idempotent consumers, dead-letter queue,
                    virus scanning (ClamAV), Temporal workflows and activities
apps/web            Next.js app (Keycloak sign-in via next-auth, server-side API calls)
services/excel      Python FastAPI Excel service (workbook inspection; staging writes from Sprint 1)
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

Excel service: `cd services/excel && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/uvicorn app.main:app --port 8001`

Dev users (password `password`): `alice` (Acme, requester), `bob` (Acme, approver/buyer/finance/admin), `carol` (Globex, requester/admin).

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

## Tests

`pnpm test` runs integration tests against the dev stack, with real Postgres, Keycloak tokens, NATS, S3, ClamAV and Temporal. The Python tests are in `services/excel` and run with `pytest`.

What the tests prove:
- **Tenant isolation:** row-level security blocks cross-tenant reads, writes and updates, and a query with no tenant context sees nothing.
- **Audit trail:** the audit log is append-only for the app role and hash-chained per tenant, and chain verification passes.
- **Atomic writes:** a write, its audit record and its outbox event commit in one transaction.
- **Event delivery:** the relay publishes events, JetStream drops duplicate publishes, consumers are idempotent and roll back on failure, and poison events go to the dead-letter queue.
- **Virus scanning:** real ClamAV detects the EICAR test file (kept in quarantine), clean files are released, and redelivery is a no-op.
- **Workflows:** the upload deadline expires abandoned uploads, stops early when the upload completes, and starts only once per upload.
- **API security:** roles are enforced, input is validated, and uploads go into quarantine with size and hash checks.

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

## Production database prerequisites

The DBA creates the `vprocly_app` login role (no `BYPASSRLS`, not the owner) and the `vector` and `pgcrypto` extensions (see [infra/compose/postgres/init.sql](infra/compose/postgres/init.sql)). Migrations run as the owner role through the Helm pre-install/upgrade Job.
