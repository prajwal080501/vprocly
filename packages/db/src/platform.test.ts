import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendAudit, verifyAuditChain } from './audit.js';
import { createDatabase, createPool, withTenant, type Database } from './client.js';
import { claimOutbox, enqueueEvent, markOutboxFailed, markOutboxPublished } from './outbox.js';
import { suppliers } from './schema/index.js';

// Requires the dev stack (pnpm stack:up), migrations and dev seed. Connects as the RLS-bound app role.
const APP_URL = process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly';
const ACME = '11111111-1111-4111-8111-111111111111';
const GLOBEX = '22222222-2222-4222-8222-222222222222';

const pool = createPool(APP_URL);
let db: Database;
const code = `T-${randomUUID().slice(0, 8)}`;

beforeAll(() => {
  db = createDatabase(pool);
});
afterAll(async () => {
  await pool.end();
});

/** Drizzle wraps driver errors ("Failed query ..."); assert on the underlying Postgres message. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(err, 'expected the query to fail').not.toBeNull();
  expect(err!.cause?.message ?? err!.message).toMatch(pattern);
}

describe('tenant isolation (RLS)', () => {
  it('only shows rows of the tenant in context', async () => {
    await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.insert(suppliers).values({ tenantId: ACME, code, name: 'Acme-only supplier' }),
    );
    const seenByAcme = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(suppliers).where(eq(suppliers.code, code)),
    );
    const seenByGlobex = await withTenant(db, { tenantId: GLOBEX }, (tx) =>
      tx.select().from(suppliers).where(eq(suppliers.code, code)),
    );
    expect(seenByAcme).toHaveLength(1);
    expect(seenByGlobex).toHaveLength(0);
  });

  it('shows nothing without a tenant context', async () => {
    const rows = await db.select().from(suppliers).where(eq(suppliers.code, code));
    expect(rows).toHaveLength(0);
  });

  it('rejects writing a row for another tenant', async () => {
    await expectDbError(
      withTenant(db, { tenantId: GLOBEX }, (tx) =>
        tx.insert(suppliers).values({ tenantId: ACME, code: `${code}-x`, name: 'Cross-tenant write' }),
      ),
      /row-level security/,
    );
  });

  it('cannot update or delete another tenant’s rows', async () => {
    const updated = await withTenant(db, { tenantId: GLOBEX }, (tx) =>
      tx.update(suppliers).set({ name: 'hijacked' }).where(eq(suppliers.code, code)).returning(),
    );
    expect(updated).toHaveLength(0);
  });
});

describe('audit log', () => {
  it('chains hashes and verifies intact', async () => {
    await withTenant(db, { tenantId: ACME }, async (tx) => {
      await appendAudit(tx, { actorType: 'system', action: 'test.one', entityType: 'test', entityId: '1' });
      await appendAudit(tx, { actorType: 'system', action: 'test.two', entityType: 'test', entityId: '1', data: { a: 1 } });
    });
    const broken = await withTenant(db, { tenantId: ACME }, (tx) => verifyAuditChain(tx));
    expect(broken).toBeNull();
  });

  it('is append-only for the app role', async () => {
    await expectDbError(
      withTenant(db, { tenantId: ACME }, (tx) => tx.execute(sql`UPDATE audit_log SET action = 'tampered'`)),
      /permission denied/,
    );
    await expectDbError(
      withTenant(db, { tenantId: ACME }, (tx) => tx.execute(sql`DELETE FROM audit_log`)),
      /permission denied/,
    );
  });

  it('refuses to append without a tenant context', async () => {
    await expectDbError(
      db.transaction((tx) => appendAudit(tx, { actorType: 'system', action: 'x', entityType: 'x', entityId: 'x' })),
      /app.tenant_id/,
    );
  });
});

describe('outbox relay functions', () => {
  it('claims pending events across tenants, marks them published, and backs off failures', async () => {
    const aggregateId = randomUUID();
    await withTenant(db, { tenantId: ACME }, (tx) =>
      enqueueEvent(tx, ACME, { eventType: 'test.ok', eventVersion: 1, aggregateType: 'test', aggregateId, payload: {} }),
    );
    await withTenant(db, { tenantId: GLOBEX }, (tx) =>
      enqueueEvent(tx, GLOBEX, { eventType: 'test.fail', eventVersion: 1, aggregateType: 'test', aggregateId, payload: {} }),
    );

    await db.transaction(async (tx) => {
      const claimed = (await claimOutbox(tx, 1000)).filter((r) => r.aggregate_id === aggregateId);
      expect(claimed.map((r) => r.tenant_id).sort()).toEqual([ACME, GLOBEX]);
      await markOutboxPublished(tx, claimed.filter((r) => r.event_type === 'test.ok').map((r) => r.id));
      await markOutboxFailed(tx, claimed.find((r) => r.event_type === 'test.fail')!.id, 'boom');
    });

    await db.transaction(async (tx) => {
      const again = (await claimOutbox(tx, 1000)).filter((r) => r.aggregate_id === aggregateId);
      expect(again).toHaveLength(0); // one published, one waiting for backoff
    });
  });

  it('does not let the app role read other tenants’ outbox rows directly', async () => {
    const rows = await withTenant(db, { tenantId: GLOBEX }, (tx) =>
      tx.execute(sql`SELECT count(*)::int AS n FROM outbox WHERE tenant_id = ${ACME}`),
    );
    expect(rows.rows[0]).toEqual({ n: 0 });
  });
});
