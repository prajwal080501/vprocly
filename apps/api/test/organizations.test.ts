import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { auditLog, createDatabase, createPool, withTenant } from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, decodeJwtClaims, tokenForCredentials } from './helpers.js';

let app: INestApplication;
let http: ReturnType<typeof request>;
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);

beforeAll(async () => {
  app = await createTestApp();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
  await pool.end();
});

function fresh() {
  const n = randomUUID().slice(0, 8);
  return { companyName: `Test Org ${n} Pvt Ltd`, adminName: 'Jane Owner', email: `owner-${n}@example.com`, password: 'a-very-long-owner-password' };
}

describe('organization signup', () => {
  it('validates input', async () => {
    const res = await http.post('/api/organizations/signup').send({ companyName: '', adminName: '', email: 'not-an-email', password: 'short' }).expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['companyName', 'email', 'password']));
  });

  it('creates a tenant with a slug derived from the company name, an audited creation, and a working admin login', async () => {
    const input = fresh();
    const res = await http.post('/api/organizations/signup').send(input).expect(201);
    expect(res.body.tenantId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.slug).toMatch(/^test-org-/);

    const audit = await withTenant(db, { tenantId: res.body.tenantId }, (tx) =>
      tx.select().from(auditLog).where(and(eq(auditLog.entityType, 'tenant'), eq(auditLog.entityId, res.body.tenantId))),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'organization.created', actorType: 'system', data: { companyName: input.companyName } });

    // The admin can log in immediately, lands in the new tenant with the right roles, and no tenant_id
    // collision with anyone else's data (a fresh tenant has nothing in it yet).
    const token = await tokenForCredentials(input.email, input.password);
    const claims = decodeJwtClaims(token);
    expect(claims).toMatchObject({ tenant_id: res.body.tenantId, roles: expect.arrayContaining(['tenant_admin', 'buyer']) });

    const me = await http.get('/api/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body).toMatchObject({
      user: { email: input.email, name: input.adminName, roles: expect.arrayContaining(['tenant_admin', 'buyer']) },
      tenant: { id: res.body.tenantId, slug: res.body.slug, name: input.companyName },
    });
    const ownRequests = await http.get('/api/sourcing-requests').set('Authorization', `Bearer ${token}`).expect(200);
    expect(ownRequests.body).toEqual([]);
  });

  it('gives two companies with the same name different slugs, both usable', async () => {
    const a = fresh();
    const b = { ...fresh(), companyName: a.companyName };
    const resA = await http.post('/api/organizations/signup').send(a).expect(201);
    const resB = await http.post('/api/organizations/signup').send(b).expect(201);
    expect(resA.body.slug).not.toBe(resB.body.slug);
    expect(resA.body.tenantId).not.toBe(resB.body.tenantId);
  });

  it('rejects a duplicate email with 409 (checked before creating a tenant, not after)', async () => {
    const input = fresh();
    await http.post('/api/organizations/signup').send(input).expect(201);

    const res = await http.post('/api/organizations/signup').send({ ...fresh(), email: input.email }).expect(409);
    expect(res.body.message).toMatch(/already exists/i);

    // The original account is unaffected by the failed second attempt.
    await tokenForCredentials(input.email, input.password);
  });
});
