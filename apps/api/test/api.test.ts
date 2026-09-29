import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createDatabase, createPool, outbox, withTenant } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, tokenFor } from './helpers.js';

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

describe('authentication', () => {
  it('serves health checks without a token', async () => {
    await http.get('/health/ready').expect(200, { status: 'ok' });
  });

  it('rejects missing and invalid tokens', async () => {
    await http.get('/api/me').expect(401);
    await http.get('/api/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('resolves the caller, tenant and roles from the token', async () => {
    const res = await http.get('/api/me').set(as('bob')).expect(200);
    expect(res.body.tenant).toMatchObject({ id: ACME, slug: 'acme' });
    expect(res.body.user.roles).toEqual(expect.arrayContaining(['buyer', 'tenant_admin']));
    expect(res.body.user.phone).toBeNull();
    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lets a buyer set their own mobile number, independent of email/displayName (which stay identity-provider-sourced)', async () => {
    const phone = `+9198${randomUUID().slice(0, 8)}`;
    const updated = await http.patch('/api/me').set(as('alice')).send({ phone }).expect(200);
    expect(updated.body.user.phone).toBe(phone);

    const refetched = await http.get('/api/me').set(as('alice')).expect(200);
    expect(refetched.body.user.phone).toBe(phone);
    // A subsequent request re-runs the JIT-provisioning upsert (email/displayName), which must not clobber it.
    const stillThere = await http.get('/api/me').set(as('alice')).expect(200);
    expect(stillThere.body.user.phone).toBe(phone);

    await http.patch('/api/me').set(as('alice')).send({ phone: null }).expect(200);
    const cleared = await http.get('/api/me').set(as('alice')).expect(200);
    expect(cleared.body.user.phone).toBeNull();
  });
});

describe('suppliers: authorization, isolation, audit and events', () => {
  const code = `SUP-${randomUUID().slice(0, 8)}`;
  const correlationId = randomUUID();
  let supplierId: string;

  it('forbids a requester from creating suppliers', async () => {
    await http.post('/api/suppliers').set(as('alice')).send({ code, name: 'Nope' }).expect(403);
  });

  it('validates input', async () => {
    const res = await http.post('/api/suppliers').set(as('bob')).send({ code: '', name: 'X', email: 'bad' }).expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['code', 'email']));
  });

  it('creates a supplier with provenance, audit record and outbox event in one transaction', async () => {
    const res = await http
      .post('/api/suppliers')
      .set(as('bob'))
      .set('x-correlation-id', correlationId)
      .send({ code, name: 'Shree Steel Traders', taxId: '27AABCS1234F1Z5' })
      .expect(201);
    supplierId = res.body.id;
    expect(res.body).toMatchObject({ code, tenantId: ACME, sourceSystem: 'manual', correlationId, version: 1 });

    const audit = await http
      .get('/api/audit')
      .query({ entityType: 'supplier', entityId: supplierId })
      .set(as('bob'))
      .expect(200);
    expect(audit.body).toHaveLength(1);
    expect(audit.body[0]).toMatchObject({ action: 'supplier.created', correlationId, actorType: 'user' });

    const events = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(eq(outbox.aggregateId, supplierId)),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'master_data.supplier_created', eventVersion: 1, correlationId });
  });

  it('rejects a duplicate supplier code', async () => {
    await http.post('/api/suppliers').set(as('bob')).send({ code, name: 'Duplicate' }).expect(409);
  });

  it('hides the supplier from another tenant', async () => {
    await http.get(`/api/suppliers/${supplierId}`).set(as('carol')).expect(404);
    const list = await http.get('/api/suppliers').query({ q: code }).set(as('carol')).expect(200);
    expect(list.body).toHaveLength(0);
    const own = await http.get('/api/suppliers').query({ q: code }).set(as('alice')).expect(200);
    expect(own.body).toHaveLength(1);
  });

  it('keeps the audit chain intact', async () => {
    const res = await http.get('/api/audit/verify').set(as('bob')).expect(200);
    expect(res.body).toEqual({ intact: true, brokenAt: null });
  });

  it('restricts audit access to admins and finance', async () => {
    await http.get('/api/audit/verify').set(as('alice')).expect(403);
  });
});

describe('documents: presigned upload into quarantine', () => {
  it('uploads, verifies size and records the hash', async () => {
    const body = Buffer.from('Item,Qty\nSteel plate,10\n');
    const created = await http
      .post('/api/documents/uploads')
      .set(as('alice'))
      .send({ fileName: 'indent.csv', contentType: 'text/csv', sizeBytes: body.length, purpose: 'import' })
      .expect(201);

    const put = await fetch(created.body.uploadUrl, {
      method: 'PUT',
      body,
      headers: created.body.headers,
    });
    expect(put.status, await put.clone().text()).toBe(200);

    const done = await http
      .post(`/api/documents/${created.body.documentId}/complete`)
      .set(as('alice'))
      .send({ purpose: 'import' })
      .expect(201);
    expect(done.body).toMatchObject({
      status: 'pending_scan',
      sha256: createHash('sha256').update(body).digest('hex'),
      bucket: 'vprocly-quarantine',
    });

    // Not downloadable until the virus scanner releases it.
    await http.get(`/api/documents/${created.body.documentId}/download-url`).set(as('alice')).expect(409);

    // Completing twice is refused; another tenant cannot see the document.
    await http.post(`/api/documents/${created.body.documentId}/complete`).set(as('alice')).send({ purpose: 'import' }).expect(404);
    await http.get(`/api/documents/${created.body.documentId}`).set(as('carol')).expect(404);
  });

  it('refuses disallowed content types and oversize files', async () => {
    await http
      .post('/api/documents/uploads')
      .set(as('alice'))
      .send({ fileName: 'macro.xlsm', contentType: 'application/vnd.ms-excel.sheet.macroEnabled.12', sizeBytes: 10, purpose: 'import' })
      .expect(400);
    await http
      .post('/api/documents/uploads')
      .set(as('alice'))
      .send({ fileName: 'big.csv', contentType: 'text/csv', sizeBytes: 60 * 1024 * 1024, purpose: 'import' })
      .expect(400);
  });
});
