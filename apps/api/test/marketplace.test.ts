import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createInviteToken } from '@vprocly/contracts';
import {
  categories,
  createDatabase,
  createPool,
  documents,
  outbox,
  platformSuppliers,
  sourcingLineNotifications,
  sourcingLines,
  supplierCategories,
  withTenant,
} from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, decodeJwtClaims, tokenFor, tokenForCredentials } from './helpers.js';

const ACME = '11111111-1111-4111-8111-111111111111';

let app: INestApplication;
let http: ReturnType<typeof request>;
const tokens: Record<'alice' | 'bob' | 'carol', string> = { alice: '', bob: '', carol: '' };
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);

beforeAll(async () => {
  app = await createTestApp();
  http = request(app.getHttpServer());
  [tokens.alice, tokens.bob, tokens.carol] = await Promise.all([tokenFor('alice'), tokenFor('bob'), tokenFor('carol')]);
});

afterAll(async () => {
  await app?.close();
  await pool.end();
});

const as = (user: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[user]}` });

/** Inserts a notification row with a known raw token, bypassing the mailer -- mirrors how the mailer would
 *  fill it in once it actually sends the email (see apps/worker/src/consumers/sourcing-invite-mailer.ts). */
async function seedInvite(sourcingLineId: string, email: string, expiresInMs = 14 * 24 * 60 * 60 * 1000) {
  const { token, tokenHash } = createInviteToken();
  await withTenant(db, { tenantId: ACME }, (tx) =>
    tx
      .insert(sourcingLineNotifications)
      .values({ tenantId: ACME, sourcingLineId, email, tokenHash, expiresAt: new Date(Date.now() + expiresInMs) })
      .onConflictDoUpdate({ target: [sourcingLineNotifications.sourcingLineId, sourcingLineNotifications.email], set: { tokenHash } }),
  );
  return token;
}

async function steelCategoryId(): Promise<string> {
  const [row] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(categories).where(eq(categories.name, 'Steel & Metal Products')));
  return row!.id;
}

/**
 * Matching is category-required, location-ranked-not-filtered (docs/plans/mvp-bidding-marketplace.md): any
 * active supplier in the category matches, regardless of city -- deliberate, so a thin early supplier pool
 * still gets notified. That means matchedSupplierCount against a shared, fixed category like "Steel & Metal
 * Products" is NOT deterministic across test/manual-testing runs against the same dev database (categories
 * are read-only via the app role, so a test cannot create a disposable one). Tests compute the pre-existing
 * count and assert relative to it instead of a literal.
 */
async function countActiveSuppliersInCategory(categoryId: string): Promise<number> {
  const rows = await db
    .select({ id: platformSuppliers.id })
    .from(platformSuppliers)
    .innerJoin(supplierCategories, eq(supplierCategories.platformSupplierId, platformSuppliers.id))
    .where(and(eq(supplierCategories.categoryId, categoryId), eq(platformSuppliers.status, 'active')));
  return rows.length;
}

describe('categories', () => {
  it('is public and seeded', async () => {
    const res = await http.get('/api/categories').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(12);
    expect(res.body.map((c: { name: string }) => c.name)).toContain('Steel & Metal Products');
  });
});

describe('sourcing: manual creation, matching, isolation, audit and events', () => {
  const city = `TestCity-${randomUUID().slice(0, 6)}`; // unique per run so matching results are deterministic
  let sourcingRequestId: string;
  let sourcingLineId: string;

  it('requires auth', async () => {
    await http.post('/api/sourcing-requests').send({ title: 'x', lines: [] }).expect(401);
  });

  it('validates input', async () => {
    const res = await http.post('/api/sourcing-requests').set(as('bob')).send({ title: '', lines: [] }).expect(400);
    expect(res.body.issues).toBeDefined();
  });

  it('creates a request with a line, matches any existing suppliers in the category, and invites a cold-start email', async () => {
    const categoryId = await steelCategoryId();
    const baseline = await countActiveSuppliersInCategory(categoryId);
    const inviteEmail = `cold-${randomUUID().slice(0, 8)}@example.com`;
    const res = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({
        title: 'Test BOM',
        lines: [
          {
            description: 'Test MS Plate',
            categoryId,
            qty: 5,
            uom: 'NOS',
            deliveryCity: city,
            deliveryState: 'TestState',
            inviteEmails: [inviteEmail],
          },
        ],
      })
      .expect(201);
    sourcingRequestId = res.body.sourcingRequestId;
    expect(res.body.matches).toEqual([{ description: 'Test MS Plate', matchedSupplierCount: Math.min(baseline, 10), invitedNewCount: 1 }]);

    const detail = await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(200);
    sourcingLineId = detail.body.lines[0].id;
    expect(detail.body.lines[0]).toMatchObject({ description: 'Test MS Plate', deliveryCity: city });

    const audit = await http.get('/api/audit').query({ entityType: 'sourcing_line', entityId: sourcingLineId }).set(as('bob')).expect(200);
    expect(audit.body[0]).toMatchObject({ action: 'sourcing_line.created', data: { invitedNewCount: 1 } });

    const events = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(outbox).where(eq(outbox.aggregateId, sourcingLineId)));
    expect(events.map((e) => e.eventType)).toEqual(expect.arrayContaining(['sourcing.sourcing_line_matched']));

    // Notification row exists but has no token yet -- the worker fills that in only when it sends the email.
    // (The line's own category may also have pre-existing matched suppliers from other runs, so this checks
    // for the specific cold-start invite rather than asserting the whole set of notification rows.)
    const notifications = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingLineNotifications).where(eq(sourcingLineNotifications.sourcingLineId, sourcingLineId)),
    );
    expect(notifications).toContainEqual(expect.objectContaining({ email: inviteEmail, tokenHash: null, sentAt: null }));
  });

  it('hides the request from another tenant', async () => {
    await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('carol')).expect(404);
    const list = await http.get('/api/sourcing-requests').set(as('carol')).expect(200);
    expect(list.body.some((r: { id: string }) => r.id === sourcingRequestId)).toBe(false);
  });

  it('auto-matches an already-registered supplier in the same category, with no invite needed', async () => {
    const categoryId = await steelCategoryId();
    const baseline = await countActiveSuppliersInCategory(categoryId);
    const email = `matched-${randomUUID().slice(0, 8)}@example.com`;
    const [row] = await db
      .insert(platformSuppliers)
      .values({ name: 'Auto Match Supplier', gst: 'X', email, city, state: 'TestState', keycloakSubject: `test-${randomUUID()}` })
      .returning({ id: platformSuppliers.id });
    const supplierId = row!.id;
    await db.insert(supplierCategories).values({ platformSupplierId: supplierId, categoryId });

    const res = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({ title: 'Second BOM', lines: [{ description: 'Angle', categoryId, qty: 1, uom: 'NOS', deliveryCity: city, deliveryState: 'TestState' }] })
      .expect(201);
    expect(res.body.matches).toEqual([{ description: 'Angle', matchedSupplierCount: Math.min(baseline + 1, 10), invitedNewCount: 0 }]);
  });
});

describe('sourcing: delete', () => {
  async function createRequest(): Promise<{ sourcingRequestId: string; sourcingLineId: string }> {
    const categoryId = await steelCategoryId();
    const res = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({
        title: 'To be deleted',
        lines: [{ description: 'Delete-me item', categoryId, qty: 1, uom: 'NOS', deliveryCity: 'X', deliveryState: 'X' }],
      })
      .expect(201);
    const detail = await http.get(`/api/sourcing-requests/${res.body.sourcingRequestId}`).set(as('bob')).expect(200);
    return { sourcingRequestId: res.body.sourcingRequestId, sourcingLineId: detail.body.lines[0].id };
  }

  it('requires auth', async () => {
    const { sourcingRequestId } = await createRequest();
    await http.delete(`/api/sourcing-requests/${sourcingRequestId}`).expect(401);
    // requester (alice's role) is allowed to delete, same as it is allowed to create.
    await http.delete(`/api/sourcing-requests/${sourcingRequestId}`).set(as('alice')).expect(204);
  });

  it('another tenant cannot delete it, and it is unaffected', async () => {
    const { sourcingRequestId } = await createRequest();
    await http.delete(`/api/sourcing-requests/${sourcingRequestId}`).set(as('carol')).expect(404);
    await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(200);
  });

  it('404s for an unknown id', async () => {
    await http.delete(`/api/sourcing-requests/${randomUUID()}`).set(as('bob')).expect(404);
  });

  it('deletes the request, its lines and their notifications, audits it, and a re-fetched invite for it is gone', async () => {
    const { sourcingRequestId, sourcingLineId } = await createRequest();
    const invite = await seedInvite(sourcingLineId, `pre-delete-${randomUUID().slice(0, 8)}@example.com`);

    await http.delete(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(204);

    await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(404);
    const list = await http.get('/api/sourcing-requests').set(as('bob')).expect(200);
    expect(list.body.some((r: { id: string }) => r.id === sourcingRequestId)).toBe(false);

    const lines = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(sourcingLines).where(eq(sourcingLines.id, sourcingLineId)));
    expect(lines).toHaveLength(0);
    const notifications = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingLineNotifications).where(eq(sourcingLineNotifications.sourcingLineId, sourcingLineId)),
    );
    expect(notifications).toHaveLength(0);

    // The audit record survives even though the live rows are gone -- it is append-only and independent.
    const audit = await http.get('/api/audit').query({ entityType: 'sourcing_request', entityId: sourcingRequestId }).set(as('bob')).expect(200);
    expect(audit.body.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['sourcing_request.deleted']));

    // The now-deleted line's invite correctly falls through to "invalid or expired" -- no separate
    // cancelled-state handling needed.
    await http.get(`/api/invites/${invite}`).expect(404);
  });

  it('is idempotent-safe: deleting twice 404s the second time rather than double-processing', async () => {
    const { sourcingRequestId } = await createRequest();
    await http.delete(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(204);
    await http.delete(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(404);
  });
});

describe('sourcing: BOM import (fixed template)', () => {
  async function uploadCleanCsv(csv: string): Promise<string> {
    const body = Buffer.from(csv);
    const created = await http
      .post('/api/documents/uploads')
      .set(as('bob'))
      .send({ fileName: 'bom.csv', contentType: 'text/csv', sizeBytes: body.length, purpose: 'import' })
      .expect(201);
    await fetch(created.body.uploadUrl, { method: 'PUT', body, headers: created.body.headers }).then((r) => expect(r.status).toBe(200));
    await http.post(`/api/documents/${created.body.documentId}/complete`).set(as('bob')).send({ purpose: 'import' }).expect(201);
    // Test-only shortcut: the real scan happens in the worker (see document-scanner.test.ts); mark it clean
    // directly so this suite can test import/matching without depending on a live ClamAV-consuming worker.
    await withTenant(db, { tenantId: ACME }, (tx) => tx.update(documents).set({ status: 'clean' }).where(eq(documents.id, created.body.documentId)));
    return created.body.documentId as string;
  }

  const HEADER = 'Item Code,Description,Category,Qty,UOM,Delivery City,Delivery State,Need By,Invite Emails';

  it('rejects a document that is not scanned clean', async () => {
    const created = await http
      .post('/api/documents/uploads')
      .set(as('bob'))
      .send({ fileName: 'x.csv', contentType: 'text/csv', sizeBytes: 3, purpose: 'import' })
      .expect(201);
    await http.post('/api/sourcing-requests/import').set(as('bob')).send({ title: 'x', documentId: created.body.documentId }).expect(400);
  });

  it('reports unrecognized/missing columns without committing anything', async () => {
    const documentId = await uploadCleanCsv('Foo,Bar\nx,y\n');
    const res = await http.post('/api/sourcing-requests/import').set(as('bob')).send({ title: 'Bad template', documentId }).expect(201);
    expect(res.body.status).toBe('template_error');
    expect(res.body.missingColumns).toEqual(expect.arrayContaining(['Description', 'Category', 'Qty', 'UOM', 'Delivery City', 'Delivery State']));
  });

  it('reports row errors (e.g. non-numeric qty) without committing anything', async () => {
    const city = `RowErrCity-${randomUUID().slice(0, 6)}`;
    const csv = `${HEADER}\nA1,Test Item,Steel & Metal Products,not-a-number,NOS,${city},TestState,,`;
    const documentId = await uploadCleanCsv(csv);
    const res = await http.post('/api/sourcing-requests/import').set(as('bob')).send({ title: 'Bad qty', documentId }).expect(201);
    expect(res.body.status).toBe('row_errors');
    expect(res.body.rowErrors[0]).toMatchObject({ row: 1 });
  });

  it('rejects an unknown category name', async () => {
    const city = `UnkCatCity-${randomUUID().slice(0, 6)}`;
    const csv = `${HEADER}\nA1,Test Item,Not A Real Category,5,NOS,${city},TestState,,`;
    const documentId = await uploadCleanCsv(csv);
    const res = await http.post('/api/sourcing-requests/import').set(as('bob')).send({ title: 'Bad category', documentId }).expect(201);
    expect(res.body.status).toBe('template_error');
    expect(res.body.unknownCategories).toEqual(['Not A Real Category']);
  });

  it('imports a valid BOM end to end, including a header row above the real header', async () => {
    const city = `BomCity-${randomUUID().slice(0, 6)}`;
    const inviteEmail = `bom-${randomUUID().slice(0, 8)}@example.com`;
    const csv = [
      'Acme Manufacturing Pvt Ltd - internal notes (not a real header)',
      HEADER,
      `A1,MS Plate 10mm,Steel & Metal Products,25,NOS,${city},TestState,2026-12-01,${inviteEmail}`,
      `A2,Hex Bolt M12,Mechanical Parts & Fasteners,400,NOS,${city},TestState,,`,
    ].join('\n');
    const documentId = await uploadCleanCsv(csv);
    const res = await http.post('/api/sourcing-requests/import').set(as('bob')).send({ title: 'Real BOM', documentId }).expect(201);
    expect(res.body.status).toBeUndefined(); // success shape has no 'status' field, unlike the error shapes
    expect(res.body.lineCount).toBe(2);
    expect(res.body.matches.map((m: { invitedNewCount: number }) => m.invitedNewCount)).toEqual([1, 0]);
  });
});

describe('supplier invites: blind identity, signup, wallet grant, replay protection', () => {
  let sourcingLineId: string;
  const email = `invitee-${randomUUID().slice(0, 8)}@example.com`;
  let token: string;

  beforeAll(async () => {
    const [line] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select({ id: sourcingLines.id }).from(sourcingLines).limit(1));
    sourcingLineId = line!.id;
    token = await seedInvite(sourcingLineId, email);
  });

  it('returns 404 for an unknown token', async () => {
    await http.get('/api/invites/does-not-exist').expect(404);
  });

  it('shows the line but never any buyer/tenant field (blind-bid rule)', async () => {
    const res = await http.get(`/api/invites/${token}`).expect(200);
    expect(res.body).toMatchObject({ status: 'pending_signup', email });
    const flat = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of ['acme', 'tenant', 'buyer', 'sourcingrequest']) {
      expect(flat).not.toContain(forbidden);
    }
  });

  it('validates signup input', async () => {
    const categoryId = await steelCategoryId();
    await http.post(`/api/invites/${token}/signup`).send({ name: 'X', gst: 'X', categoryId, city: 'X', state: 'X', password: 'short' }).expect(400);
    await http.post(`/api/invites/${token}/signup`).send({ name: 'X', gst: 'X', categoryId: randomUUID(), city: 'X', state: 'X', password: 'longenough1' }).expect(400);
  });

  it('signs up, grants 1000 points, and the account can log in with platform_supplier_id and no tenant_id', async () => {
    const categoryId = await steelCategoryId();
    const password = 'a-very-long-supplier-password';
    const res = await http
      .post(`/api/invites/${token}/signup`)
      .send({ name: 'New Supplier Co', gst: '27AAAAA0000A1Z5', categoryId, city: 'Pune', state: 'Maharashtra', password })
      .expect(201);
    expect(res.body).toEqual({ platformSupplierId: expect.stringMatching(/^[0-9a-f-]{36}$/), walletBalance: 1000 });

    const supplierToken = await tokenForCredentials(email, password);
    const claims = decodeJwtClaims(supplierToken);
    // tenant_id must be genuinely absent, not just falsy: a Keycloak user-attribute mapper omits an unset
    // attribute entirely, and AuthGuard's tenant path only ever sees a real tenant this way.
    expect('tenant_id' in claims).toBe(false);
    expect(claims).toMatchObject({ platform_supplier_id: res.body.platformSupplierId, roles: expect.arrayContaining(['supplier']) });
  });

  it('is consumed and cannot be replayed', async () => {
    const view = await http.get(`/api/invites/${token}`).expect(200);
    expect(view.body).toEqual({ status: 'consumed' });

    const categoryId = await steelCategoryId();
    await http.post(`/api/invites/${token}/signup`).send({ name: 'X', gst: 'X', categoryId, city: 'X', state: 'X', password: 'longenough1' }).expect(409);
  });

  it('refuses to register the same email twice via a second invite', async () => {
    const secondToken = await seedInvite(sourcingLineId, email);
    const categoryId = await steelCategoryId();
    await http.post(`/api/invites/${secondToken}/signup`).send({ name: 'X', gst: 'X', categoryId, city: 'X', state: 'X', password: 'longenough1' }).expect(409);
  });
});
