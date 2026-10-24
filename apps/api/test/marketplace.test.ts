import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createInviteToken } from '@vprocly/contracts';
import {
  bids,
  bidRevisions,
  categories,
  createDatabase,
  createPool,
  documents,
  outbox,
  platformSuppliers,
  purchaseOrders,
  purchaseOrderOutcomes,
  sourcingLineNotifications,
  sourcingLines,
  sourcingResearchJobs,
  sourcingRequests,
  suppliers,
  supplierCategories,
  supplierCapabilities,
  supplierMembers,
  supplierScoreSnapshots,
  supplierVoiceCalls,
  walletBalances,
  withTenant,
} from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, decodeJwtClaims, tokenFor, tokenForCredentials } from './helpers.js';
import { BID_FEE_POINTS } from '../src/modules/marketplace-suppliers/wallet.service.js';

const ACME = '11111111-1111-4111-8111-111111111111';
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:58025';

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

async function otpFromMail(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = (await (await fetch(`${MAILPIT_API}/api/v1/messages`)).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const hit = list.messages.find((message) => message.To.some((to) => to.Address === email));
    if (hit) {
      const message = (await (await fetch(`${MAILPIT_API}/api/v1/message/${hit.ID}`)).json()) as { Text: string };
      const code = message.Text.match(/verification code is (\d{6})/)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`OTP email was not received for ${email}`);
}

async function verifySelfSignupEmail(email: string): Promise<string> {
  await http.post('/api/supplier-signup/otp/request').send({ email }).expect(201);
  const code = await otpFromMail(email);
  const verified = await http.post('/api/supplier-signup/otp/verify').send({ email, code }).expect(201);
  return verified.body.verificationToken as string;
}

async function verifyInviteEmail(inviteToken: string, email: string): Promise<string> {
  await http.post(`/api/invites/${inviteToken}/otp/request`).send({}).expect(201);
  const code = await otpFromMail(email);
  const wrongCode = code === '000000' ? '999999' : '000000';
  await http.post(`/api/invites/${inviteToken}/otp/verify`).send({ code: wrongCode }).expect(400);
  const verified = await http.post(`/api/invites/${inviteToken}/otp/verify`).send({ code }).expect(201);
  return verified.body.verificationToken as string;
}

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

const STEEL_CATEGORY = 'Steel & Metal Products';

async function steelCategoryId(): Promise<string> {
  const [row] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(categories).where(eq(categories.name, STEEL_CATEGORY)));
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
  it('is public and seeded, including both the original generic-manufacturing and later automotive sets', async () => {
    const res = await http.get('/api/categories').expect(200);
    const names = res.body.map((c: { name: string }) => c.name);
    expect(res.body.length).toBeGreaterThanOrEqual(29);
    expect(names).toContain('Steel & Metal Products'); // migration 0004
    expect(names).toEqual(expect.arrayContaining(['Body & Structure', 'ADAS', 'EV Powertrain'])); // migration 0010
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
            category: STEEL_CATEGORY,
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
    expect(res.body.matches).toEqual([{ description: 'Test MS Plate', matchedSupplierCount: Math.min(baseline, 5), invitedNewCount: 1 }]);

    const detail = await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(200);
    sourcingLineId = detail.body.lines[0].id;
    expect(detail.body.lines[0]).toMatchObject({ description: 'Test MS Plate', deliveryCity: city });

    const audit = await http.get('/api/audit').query({ entityType: 'sourcing_line', entityId: sourcingLineId }).set(as('bob')).expect(200);
    expect(audit.body[0]).toMatchObject({ action: 'sourcing_line.created', data: { invitedNewCount: 1 } });

    const events = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(outbox).where(eq(outbox.aggregateId, sourcingLineId)));
    expect(events.map((e) => e.eventType)).toEqual(expect.arrayContaining(['sourcing.sourcing_line_matched']));

    // The aggregated per-request event (drives the buyer's summary email) carries the same totals the
    // response already reported, computed once every line has been matched, not just this one.
    const requestEvents = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(eq(outbox.aggregateId, sourcingRequestId)),
    );
    const matched = requestEvents.find((e) => e.eventType === 'sourcing.sourcing_request_matched');
    expect(matched?.payload).toMatchObject({ title: 'Test BOM', lineCount: 1, matchedSupplierCount: Math.min(baseline, 5), invitedNewCount: 1 });

    // Notification row exists but has no token yet -- the worker fills that in only when it sends the email.
    // (The line's own category may also have pre-existing matched suppliers from other runs, so this checks
    // for the specific cold-start invite rather than asserting the whole set of notification rows.)
    const notifications = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingLineNotifications).where(eq(sourcingLineNotifications.sourcingLineId, sourcingLineId)),
    );
    expect(notifications).toContainEqual(expect.objectContaining({ email: inviteEmail, tokenHash: null, sentAt: null }));
    expect(detail.body.lines[0].researchJob).toMatchObject({
      targetCount: 5,
      foundCount: Math.min(notifications.length, 5),
    });
    expect(['queued', 'partial', 'completed']).toContain(detail.body.lines[0].researchJob.status);
  });

  it('appends manual items to an existing open custom request instead of creating a duplicate', async () => {
    const title = `Maintenance batch ${randomUUID().slice(0, 8)}`;
    const line = (description: string) => ({ description, category: STEEL_CATEGORY, qty: 1, uom: 'NOS', deliveryCity: city, deliveryState: 'TestState' });
    const created = await http.post('/api/sourcing-requests').set(as('bob')).send({ title, lines: [line('First custom item')] }).expect(201);
    expect(created.body.appended).toBe(false);

    const appended = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({ title, sourcingRequestId: created.body.sourcingRequestId, lines: [line('Second custom item')] })
      .expect(201);
    expect(appended.body).toMatchObject({ sourcingRequestId: created.body.sourcingRequestId, title, lineCount: 1, appended: true });

    const detail = await http.get(`/api/sourcing-requests/${created.body.sourcingRequestId}`).set(as('bob')).expect(200);
    expect(detail.body.lines.map((item: { description: string }) => item.description)).toEqual(expect.arrayContaining(['First custom item', 'Second custom item']));
    const list = await http.get('/api/sourcing-requests').set(as('bob')).expect(200);
    expect(list.body.filter((requestRow: { title: string }) => requestRow.title === title)).toHaveLength(1);
  });

  it('lets a buyer retry a failed or partial research job', async () => {
    const category = `Retry Category ${randomUUID().slice(0, 8)}`;
    const created = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({
        title: 'Research retry test',
        lines: [{ description: 'Rare retry component', category, qty: 1, uom: 'NOS', deliveryCity: city, deliveryState: 'TestState' }],
      })
      .expect(201);
    const detail = await http.get(`/api/sourcing-requests/${created.body.sourcingRequestId}`).set(as('bob')).expect(200);
    const lineId = detail.body.lines[0].id as string;
    await withTenant(db, { tenantId: ACME }, (tx) =>
      tx
        .update(sourcingResearchJobs)
        .set({ status: 'failed', lastError: 'Test failure', completedAt: new Date() })
        .where(eq(sourcingResearchJobs.sourcingLineId, lineId)),
    );

    await http
      .post(`/api/sourcing-requests/${created.body.sourcingRequestId}/lines/${lineId}/research/retry`)
      .set(as('bob'))
      .expect(201);

    const [job] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingResearchJobs).where(eq(sourcingResearchJobs.sourcingLineId, lineId)),
    );
    expect(job).toMatchObject({ status: 'queued', lastError: null, foundCount: 0, targetCount: 5 });
    const events = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.aggregateId, lineId), eq(outbox.eventType, 'sourcing.sourcing_line_unmatched'))),
    );
    expect(events).toHaveLength(2);
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
      .values({ name: 'Auto Match Supplier', gst: 'X', email, city, state: 'TestState' })
      .returning({ id: platformSuppliers.id });
    const supplierId = row!.id;
    await db.insert(supplierCategories).values({ platformSupplierId: supplierId, categoryId });

    const res = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({ title: 'Second BOM', lines: [{ description: 'Angle', category: STEEL_CATEGORY, qty: 1, uom: 'NOS', deliveryCity: city, deliveryState: 'TestState' }] })
      .expect(201);
    expect(res.body.matches).toEqual([{ description: 'Angle', matchedSupplierCount: Math.min(baseline + 1, 5), invitedNewCount: 0 }]);
  });

  it('manually emails a supplier notification for real, even if it already shows as sent (independent of EMAIL_DELIVERY_MODE)', async () => {
    const email = `manual-email-${randomUUID().slice(0, 8)}@example.com`;
    const [notification] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.insert(sourcingLineNotifications).values({ tenantId: ACME, sourcingLineId, email, sentAt: new Date() }).returning(),
    );

    await http.post(`/api/sourcing-requests/${sourcingRequestId}/lines/${sourcingLineId}/notifications/${notification!.id}/manual-email`).set(as('bob')).expect(201);

    const events = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.aggregateId, notification!.id), eq(outbox.eventType, 'sourcing.supplier_manual_email_requested'))),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ notificationId: notification!.id, sourcingLineId });
  });

  it('rejects a manual call with no phone on file, and requests one for real when a phone exists (independent of VOICE_DELIVERY_MODE)', async () => {
    const [noPhone] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.insert(sourcingLineNotifications).values({ tenantId: ACME, sourcingLineId, email: `no-phone-${randomUUID().slice(0, 8)}@example.com` }).returning(),
    );
    await http.post(`/api/sourcing-requests/${sourcingRequestId}/lines/${sourcingLineId}/notifications/${noPhone!.id}/manual-call`).set(as('bob')).expect(400);

    const phone = '+919876543210';
    const [supplier] = await db
      .insert(platformSuppliers)
      .values({ name: 'Callable Co', gst: 'X', email: `callable-${randomUUID().slice(0, 8)}@example.com`, phone, city, state: 'TestState' })
      .returning();
    const [notification] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.insert(sourcingLineNotifications).values({ tenantId: ACME, sourcingLineId, email: supplier!.email, platformSupplierId: supplier!.id }).returning(),
    );

    await http.post(`/api/sourcing-requests/${sourcingRequestId}/lines/${sourcingLineId}/notifications/${notification!.id}/manual-call`).set(as('bob')).expect(201);

    const [voiceCall] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.notificationId, notification!.id)));
    expect(voiceCall).toMatchObject({ status: 'queued', phone });
    const events = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.aggregateId, voiceCall!.id), eq(outbox.eventType, 'sourcing.supplier_call_requested'))),
    );
    expect(events).toHaveLength(1);

    // Calling again retries in place -- same row, not a second one (notification_id is unique).
    await http.post(`/api/sourcing-requests/${sourcingRequestId}/lines/${sourcingLineId}/notifications/${notification!.id}/manual-call`).set(as('bob')).expect(201);
    const rows = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.notificationId, notification!.id)));
    expect(rows).toHaveLength(1);
  });
});

describe('sourcing: delete', () => {
  async function createRequest(): Promise<{ sourcingRequestId: string; sourcingLineId: string }> {
    const res = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({
        title: 'To be deleted',
        lines: [{ description: 'Delete-me item', category: STEEL_CATEGORY, qty: 1, uom: 'NOS', deliveryCity: 'X', deliveryState: 'X' }],
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

  it('a category name outside the seeded list resolves-or-creates instead of being rejected (domain-agnostic matching)', async () => {
    const city = `NewCatCity-${randomUUID().slice(0, 6)}`;
    const categoryName = `Artisanal Textile Dyes ${randomUUID().slice(0, 8)}`; // guaranteed never seen before
    const csv = `${HEADER}\nA1,Test Item,${categoryName},5,NOS,${city},TestState,,`;
    const documentId = await uploadCleanCsv(csv);
    const res = await http.post('/api/sourcing-requests/import').set(as('bob')).send({ title: 'New domain BOM', documentId }).expect(201);
    expect(res.body.status).toBeUndefined(); // no more template_error for an unrecognized category
    expect(res.body.lineCount).toBe(1);

    const [row] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(categories).where(eq(categories.name, categoryName)));
    expect(row).toBeDefined();

    // Uploading the exact same name again reuses the row it just created rather than duplicating it.
    const documentId2 = await uploadCleanCsv(csv);
    await http.post('/api/sourcing-requests/import').set(as('bob')).send({ title: 'Same new domain, again', documentId: documentId2 }).expect(201);
    const rows = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(categories).where(eq(categories.name, categoryName)));
    expect(rows).toHaveLength(1);
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

  it('imports a real-world automotive BOM using the later-added category set (migration 0010)', async () => {
    const city = `AutoCity-${randomUUID().slice(0, 6)}`;
    const csv = [
      HEADER,
      `MB-1,High-strength automotive steel sheet 1.2mm,Body & Structure,12000,KG,${city},Maharashtra,2026-10-20,`,
      `MB-2,Front ventilated brake disc 350mm,Braking,500,EA,${city},Maharashtra,2026-11-05,`,
      `MB-3,77GHz automotive radar sensor module,ADAS,250,EA,${city},Maharashtra,2026-11-18,`,
      `MB-4,400V traction inverter 150kW class,EV Powertrain,250,EA,${city},Maharashtra,2026-12-05,`,
    ].join('\n');
    const documentId = await uploadCleanCsv(csv);
    const res = await http.post('/api/sourcing-requests/import').set(as('bob')).send({ title: 'Automotive BOM', documentId }).expect(201);
    expect(res.body.status).toBeUndefined();
    expect(res.body.lineCount).toBe(4);
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
    await http.post(`/api/invites/${token}/signup`).send({ name: 'X', gst: 'X', categories: [STEEL_CATEGORY], city: 'X', state: 'X', password: 'short' }).expect(400);
    await http.post(`/api/invites/${token}/signup`).send({ name: 'X', gst: 'X', categories: [], city: 'X', state: 'X', password: 'longenough1' }).expect(400);
  });

  it('signs up (with multiple categories), grants 1000 points, and the account can log in with platform_supplier_id and no tenant_id', async () => {
    const password = 'a-very-long-supplier-password';
    const phone = '+919876543210';
    const verificationToken = await verifyInviteEmail(token, email);
    const res = await http
      .post(`/api/invites/${token}/signup`)
      .send({ name: 'New Supplier Co', phone, categories: [STEEL_CATEGORY, 'Bearings & Power Transmission'], city: 'Pune', state: 'Maharashtra', password, verificationToken })
      .expect(201);
    expect(res.body).toEqual({ platformSupplierId: expect.stringMatching(/^[0-9a-f-]{36}$/), walletBalance: 1000 });

    const supplierToken = await tokenForCredentials(email, password);
    const claims = decodeJwtClaims(supplierToken);
    // tenant_id must be genuinely absent, not just falsy: a Keycloak user-attribute mapper omits an unset
    // attribute entirely, and AuthGuard's tenant path only ever sees a real tenant this way.
    expect('tenant_id' in claims).toBe(false);
    expect(claims).toMatchObject({ platform_supplier_id: res.body.platformSupplierId, roles: expect.arrayContaining(['supplier']) });

    // The signup creator becomes the company's 'owner' member -- the foundation for later teammate invites
    // (Phase B), not surfaced anywhere in the UI yet.
    const members = await db.select().from(supplierMembers).where(eq(supplierMembers.platformSupplierId, res.body.platformSupplierId));
    expect(members).toEqual([expect.objectContaining({ email, role: 'owner', keycloakSubject: claims.sub })]);

    // Both submitted categories were resolved and attached -- the join table already supported many, only
    // signup only ever wrote one before this.
    const supplierCats = await db.select().from(supplierCategories).where(eq(supplierCategories.platformSupplierId, res.body.platformSupplierId));
    expect(supplierCats).toHaveLength(2);
    const [supplier] = await db.select().from(platformSuppliers).where(eq(platformSuppliers.id, res.body.platformSupplierId));
    expect(supplier).toMatchObject({ gst: null, phone });
  });

  it('is consumed and cannot be replayed', async () => {
    const view = await http.get(`/api/invites/${token}`).expect(200);
    expect(view.body).toEqual({ status: 'consumed' });

    await http.post(`/api/invites/${token}/signup`).send({ name: 'X', gst: 'X', categories: [STEEL_CATEGORY], city: 'X', state: 'X', password: 'longenough1', verificationToken: 'x'.repeat(32) }).expect(409);
  });

  it('refuses to register the same email twice via a second invite', async () => {
    const secondToken = await seedInvite(sourcingLineId, email);
    await http.post(`/api/invites/${secondToken}/signup`).send({ name: 'X', gst: 'X', categories: [STEEL_CATEGORY], city: 'X', state: 'X', password: 'longenough1', verificationToken: 'x'.repeat(32) }).expect(409);
  });
});

describe('supplier dashboard: self-serve signup, login, open lines, bidding', () => {
  const email = `selfsignup-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'a-very-long-supplier-password';
  let sourcingRequestId: string;
  let sourcingLineId: string;
  let platformSupplierId: string;
  let supplierToken: string;
  let submittedBidId: string;

  const supplierAuth = () => ({ Authorization: `Bearer ${supplierToken}` });

  beforeAll(async () => {
    const city = `TestCity-${randomUUID().slice(0, 6)}`;
    const res = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({
        title: 'Bidding dashboard test',
        lines: [{ itemCode: 'DASH-1', description: 'Dashboard test item', category: STEEL_CATEGORY, qty: 3, uom: 'NOS', deliveryCity: city, deliveryState: 'TestState', needBy: '2026-12-01' }],
      })
      .expect(201);
    sourcingRequestId = res.body.sourcingRequestId;
    const detail = await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(200);
    sourcingLineId = detail.body.lines[0].id;
  });

  it('creates an account with no invite token, collecting name/gst/email/city/state/country', async () => {
    const verificationToken = await verifySelfSignupEmail(email);
    const res = await http
      .post('/api/supplier-signup')
      .send({ name: 'Self Serve Co', gst: '27AAAAA0000A1Z5', email, categories: [STEEL_CATEGORY], city: 'Pune', state: 'Maharashtra', country: 'India', password, verificationToken })
      .expect(201);
    expect(res.body).toEqual({ platformSupplierId: expect.stringMatching(/^[0-9a-f-]{36}$/), walletBalance: 1000 });
    platformSupplierId = res.body.platformSupplierId;
  });

  it('refuses a duplicate email', async () => {
    await http
      .post('/api/supplier-signup')
      .send({ name: 'X', gst: 'X', email, categories: [STEEL_CATEGORY], city: 'X', state: 'X', country: 'X', password, verificationToken: 'x'.repeat(32) })
      .expect(409);
  });

  it('logs in with platform_supplier_id and no tenant_id, and can reach /supplier/me', async () => {
    supplierToken = await tokenForCredentials(email, password);
    const claims = decodeJwtClaims(supplierToken);
    expect('tenant_id' in claims).toBe(false);
    expect(claims).toMatchObject({ platform_supplier_id: platformSupplierId, roles: expect.arrayContaining(['supplier']) });

    const me = await http.get('/api/supplier/me').set(supplierAuth()).expect(200);
    expect(me.body).toEqual({ id: platformSupplierId, name: 'Self Serve Co', email, phone: null, city: 'Pune', state: 'Maharashtra', country: 'India', walletBalance: 1000, verified: false });
  });

  it('lets a supplier add/update their own mobile number, so the buyer-side "Call" button has something to dial', async () => {
    const phone = '+919812345678';
    const updated = await http.patch('/api/supplier/me').set(supplierAuth()).send({ phone }).expect(200);
    expect(updated.body.phone).toBe(phone);
    const refetched = await http.get('/api/supplier/me').set(supplierAuth()).expect(200);
    expect(refetched.body.phone).toBe(phone);
  });

  it('maintains a reusable normalized supplier passport', async () => {
    const initial = await http.get('/api/supplier/passport').set(supplierAuth()).expect(200);
    expect(initial.body).toMatchObject({ completionPercent: expect.any(Number) });
    const categoryId = await steelCategoryId();
    const passportGst = `27TEST${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
    const passportPhone = '+919900001234';
    const updated = await http.patch('/api/supplier/passport').set(supplierAuth()).send({
      identifiers: [{ type: 'gstin', value: passportGst }, { type: 'udyam', value: `UDYAM-${randomUUID().slice(0, 8)}` }],
      locations: [{ type: 'factory', city: 'Pune', state: 'Maharashtra', country: 'India', isPrimary: true }],
      capabilities: [{ categoryId, description: 'Precision steel parts', materials: ['Steel'], processes: ['CNC'] }],
      certifications: [{ name: 'ISO 9001' }],
      contacts: [{ name: 'Sales Desk', email, phone: passportPhone, preferredChannel: 'voice', isPrimary: true }],
    }).expect(200);
    expect(updated.body).toMatchObject({ completionPercent: 100 });
    expect(updated.body.contacts).toContainEqual(expect.objectContaining({ phone: passportPhone, isPrimary: true }));
    expect(updated.body.capabilities).toContainEqual(expect.objectContaining({ categoryId, categoryName: STEEL_CATEGORY }));
    const me = await http.get('/api/supplier/me').set(supplierAuth()).expect(200);
    expect(me.body.phone).toBe(passportPhone);
    const capabilities = await db.select().from(supplierCapabilities).where(eq(supplierCapabilities.platformSupplierId, platformSupplierId));
    expect(capabilities).toHaveLength(1);
  });

  it('exposes aggregate network intelligence and validates alert preferences', async () => {
    const initial = await http.get('/api/supplier/network-insights').set(supplierAuth()).expect(200);
    expect(initial.body).toMatchObject({
      totalOpportunities: expect.any(Number),
      activeOpportunities: expect.any(Number),
      categoryDemand: expect.any(Array),
      score: expect.objectContaining({ overall: expect.any(Number), version: expect.any(Number) }),
      preferences: { opportunityAlerts: true, digestFrequency: 'instant', minimumRecommendationScore: 0 },
    });
    const updated = await http.patch('/api/supplier/network-preferences').set(supplierAuth()).send({
      opportunityAlerts: true,
      digestFrequency: 'daily',
      minimumRecommendationScore: 65,
    }).expect(200);
    expect(updated.body.preferences).toMatchObject({ digestFrequency: 'daily', minimumRecommendationScore: 65 });
    await http.patch('/api/supplier/network-preferences').set(supplierAuth()).send({ opportunityAlerts: true, digestFrequency: 'hourly', minimumRecommendationScore: 65 }).expect(400);
    const scores = await db.select().from(supplierScoreSnapshots).where(eq(supplierScoreSnapshots.platformSupplierId, platformSupplierId));
    expect(scores.length).toBeGreaterThan(0);
  });

  it('cannot reach the buyer-only /me, and a buyer token cannot reach /supplier/me (guards never overlap)', async () => {
    await http.get('/api/me').set(supplierAuth()).expect(403);
    await http.get('/api/supplier/me').set(as('bob')).expect(403);
    await http.get('/api/supplier/me').expect(401);
  });

  it('sees no open lines until matched, and never any buyer/tenant field once it is (blind-bid rule)', async () => {
    const before = await http.get('/api/supplier/lines').set(supplierAuth()).expect(200);
    expect(before.body).toEqual([]);

    // Real auto-matching is capped and ranked (see countActiveSuppliersInCategory's own comment above), so
    // it can't guarantee a brand-new supplier lands in it -- seed the match directly instead, the same way
    // the mailer would once it actually sends an email for it.
    await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.insert(sourcingLineNotifications).values({ tenantId: ACME, sourcingLineId, email, platformSupplierId, sentAt: new Date() }),
    );

    const after = await http.get('/api/supplier/lines').set(supplierAuth()).expect(200);
    expect(after.body).toEqual([
      {
        sourcingLineId,
        itemCode: 'DASH-1',
        description: 'Dashboard test item',
        qty: '3.000',
        uom: 'NOS',
        needBy: '2026-12-01',
        alreadyBid: false,
        myUnitPrice: null,
        myMinimumOrderQty: null,
        capabilityResponse: null,
        clarificationCount: 0,
      },
    ]);
    const flat = JSON.stringify(after.body).toLowerCase();
    for (const forbidden of ['acme', 'tenant', 'buyer']) expect(flat).not.toContain(forbidden);
  });

  it('keeps capability and clarification chat scoped to one item and supplier', async () => {
    const capability = await http
      .post(`/api/supplier/lines/${sourcingLineId}/capability`)
      .set(supplierAuth())
      .send({ status: 'needs_clarification', reason: 'Please confirm the material grade' })
      .expect(201);
    expect(capability.body).toMatchObject({ status: 'needs_clarification' });

    await http
      .post(`/api/supplier/lines/${sourcingLineId}/clarifications`)
      .set(supplierAuth())
      .send({ message: 'Is IS 2062 E250 acceptable for this item?' })
      .expect(201);

    let detail = await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(200);
    expect(detail.body.lines[0].supplierResearch).toContainEqual(expect.objectContaining({
      platformSupplierId,
      capabilityResponse: expect.objectContaining({ status: 'needs_clarification', reason: 'Please confirm the material grade' }),
    }));
    expect(detail.body.lines[0].clarificationMessages).toContainEqual(expect.objectContaining({
      platformSupplierId,
      senderType: 'supplier',
      body: 'Is IS 2062 E250 acceptable for this item?',
    }));

    await http
      .post(`/api/sourcing-requests/${sourcingRequestId}/lines/${sourcingLineId}/clarifications`)
      .set(as('bob'))
      .send({ platformSupplierId, message: 'Yes, IS 2062 E250 is acceptable.' })
      .expect(201);

    const thread = await http.get('/api/supplier/clarifications').set(supplierAuth()).expect(200);
    expect(thread.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcingLineId, senderType: 'supplier', body: 'Is IS 2062 E250 acceptable for this item?' }),
      expect.objectContaining({ sourcingLineId, senderType: 'buyer', senderLabel: 'Buyer team', body: 'Yes, IS 2062 E250 is acceptable.' }),
    ]));
    expect(JSON.stringify(thread.body).toLowerCase()).not.toContain('acme');

    detail = await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(200);
    expect(detail.body.lines[0].clarificationMessages).toHaveLength(2);
    const lines = await http.get('/api/supplier/lines').set(supplierAuth()).expect(200);
    expect(lines.body[0]).toMatchObject({
      capabilityResponse: { status: 'needs_clarification', reason: 'Please confirm the material grade' },
      clarificationCount: 2,
    });
  });

  it('sees an explicit email invite even when it remains unlinked for manual-email routing', async () => {
    const category = `Direct Invite ${randomUUID().slice(0, 8)}`;
    const created = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({
        title: 'Direct registered supplier invite',
        lines: [{ description: 'Email-only dashboard item', category, qty: 2, uom: 'NOS', deliveryCity: 'Pune', deliveryState: 'Maharashtra', inviteEmails: [email.toUpperCase()] }],
      })
      .expect(201);
    const detail = await http.get(`/api/sourcing-requests/${created.body.sourcingRequestId}`).set(as('bob')).expect(200);
    const directLineId = detail.body.lines[0].id as string;

    const [notification] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingLineNotifications).where(and(eq(sourcingLineNotifications.sourcingLineId, directLineId), eq(sourcingLineNotifications.email, email.toUpperCase()))),
    );
    expect(notification?.platformSupplierId).toBeNull();

    const lines = await http.get('/api/supplier/lines').set(supplierAuth()).expect(200);
    expect(lines.body).toContainEqual(expect.objectContaining({ sourcingLineId: directLineId, description: 'Email-only dashboard item' }));
  });

  it('rejects a bid on a line this supplier was never matched to', async () => {
    const other = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({ title: 'Unmatched line', lines: [{ description: 'Not for this supplier', category: STEEL_CATEGORY, qty: 1, uom: 'NOS', deliveryCity: 'X', deliveryState: 'X' }] })
      .expect(201);
    const detail = await http.get(`/api/sourcing-requests/${other.body.sourcingRequestId}`).set(as('bob')).expect(200);
    await http.post(`/api/supplier/lines/${detail.body.lines[0].id}/bids`).set(supplierAuth()).send({ unitPrice: 10 }).expect(403);
    await http.post(`/api/supplier/lines/${detail.body.lines[0].id}/clarifications`).set(supplierAuth()).send({ message: 'Can I supply this?' }).expect(403);
    await http.post(`/api/supplier/lines/${detail.body.lines[0].id}/capability`).set(supplierAuth()).send({ status: 'can_supply' }).expect(403);
  });

  it('rejects invalid bid input', async () => {
    await http.post(`/api/supplier/lines/${sourcingLineId}/bids`).set(supplierAuth()).send({ unitPrice: -5 }).expect(400);
    await http.post(`/api/supplier/lines/${sourcingLineId}/bids`).set(supplierAuth()).send({ unitPrice: 10, minimumOrderQty: 0 }).expect(400);
    await http.post(`/api/supplier/lines/${sourcingLineId}/bids`).set(supplierAuth()).send({}).expect(400);
  });

  it('places a bid, debiting BID_FEE_POINTS exactly once, then lets the price be revised for free', async () => {
    const res = await http.post(`/api/supplier/lines/${sourcingLineId}/bids`).set(supplierAuth()).send({ unitPrice: 452.5, minimumOrderQty: 25, leadTimeDays: 7, notes: 'Can ship in one batch' }).expect(201);
    expect(res.body).toEqual({ bidId: expect.stringMatching(/^[0-9a-f-]{36}$/), walletBalance: 1000 - BID_FEE_POINTS });
    submittedBidId = res.body.bidId;

    let lines = await http.get('/api/supplier/lines').set(supplierAuth()).expect(200);
    expect(lines.body[0]).toMatchObject({ alreadyBid: true, myUnitPrice: '452.50', myMinimumOrderQty: '25.000' });

    const revised = await http.post(`/api/supplier/lines/${sourcingLineId}/bids`).set(supplierAuth()).send({ unitPrice: 440, minimumOrderQty: 50 }).expect(201);
    expect(revised.body).toEqual({ bidId: res.body.bidId, walletBalance: 1000 - BID_FEE_POINTS }); // same id, no second debit

    lines = await http.get('/api/supplier/lines').set(supplierAuth()).expect(200);
    expect(lines.body[0]).toMatchObject({ alreadyBid: true, myUnitPrice: '440.00', myMinimumOrderQty: '50.000' });
    const revisions = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(bidRevisions).where(eq(bidRevisions.bidId, submittedBidId)));
    expect(revisions).toEqual([
      expect.objectContaining({ revisionNumber: 1, source: 'portal', unitPrice: '452.50' }),
      expect.objectContaining({ revisionNumber: 2, source: 'portal', unitPrice: '440.00' }),
    ]);
  });

  it('rejects a new bid when the wallet balance is insufficient, without creating a partial bid or touching the balance', async () => {
    const other = await http
      .post('/api/sourcing-requests')
      .set(as('bob'))
      .send({ title: 'Second line for balance test', lines: [{ description: 'Needs balance', category: STEEL_CATEGORY, qty: 1, uom: 'NOS', deliveryCity: 'X', deliveryState: 'X' }] })
      .expect(201);
    const detail = await http.get(`/api/sourcing-requests/${other.body.sourcingRequestId}`).set(as('bob')).expect(200);
    const otherLineId = detail.body.lines[0].id;
    await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.insert(sourcingLineNotifications).values({ tenantId: ACME, sourcingLineId: otherLineId, email, platformSupplierId, sentAt: new Date() }),
    );

    await db.update(walletBalances).set({ balance: 0 }).where(eq(walletBalances.platformSupplierId, platformSupplierId));

    await http.post(`/api/supplier/lines/${otherLineId}/bids`).set(supplierAuth()).send({ unitPrice: 10 }).expect(409);

    const [balanceRow] = await db.select().from(walletBalances).where(eq(walletBalances.platformSupplierId, platformSupplierId));
    expect(balanceRow!.balance).toBe(0);
    const bidRows = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(bids).where(eq(bids.sourcingLineId, otherLineId)));
    expect(bidRows).toEqual([]);
  });

  it('blocks deleting a sourcing request that already has a bid on one of its lines', async () => {
    await http.delete(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(409);
  });

  it('accepts one bid atomically, creates a vendor and draft PO, and reveals the buyer only to the winner', async () => {
    const losingEmail = `losing-${randomUUID().slice(0, 8)}@example.com`;
    const losingPassword = 'another-long-supplier-password';
    const verificationToken = await verifySelfSignupEmail(losingEmail);
    const signup = await http
      .post('/api/supplier-signup')
      .send({ name: 'Runner Up Co', gst: '27BBBBB0000B1Z5', email: losingEmail, categories: [STEEL_CATEGORY], city: 'Mumbai', state: 'Maharashtra', country: 'India', password: losingPassword, verificationToken })
      .expect(201);
    const losingSupplierId = signup.body.platformSupplierId as string;
    const losingToken = await tokenForCredentials(losingEmail, losingPassword);
    const losingAuth = { Authorization: `Bearer ${losingToken}` };

    await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.insert(sourcingLineNotifications).values({ tenantId: ACME, sourcingLineId, email: losingEmail, platformSupplierId: losingSupplierId, sentAt: new Date() }),
    );
    const losingBid = await http.post(`/api/supplier/lines/${sourcingLineId}/bids`).set(losingAuth).send({ unitPrice: 460 }).expect(201);

    const beforeAward = await http.get('/api/supplier/bids').set(supplierAuth()).expect(200);
    expect(beforeAward.body[0]).toMatchObject({ bidId: submittedBidId, status: 'submitted', buyer: null });

    const award = await http
      .post(`/api/sourcing-requests/${sourcingRequestId}/lines/${sourcingLineId}/bids/${submittedBidId}/accept`)
      .set(as('bob'))
      .expect(201);
    expect(award.body).toMatchObject({ bidId: submittedBidId, sourcingLineId, status: 'accepted' });
    await http
      .post(`/api/sourcing-requests/${sourcingRequestId}/lines/${sourcingLineId}/purchase-orders/${award.body.purchaseOrderId}/outcomes`)
      .set(as('bob'))
      .send({ type: 'delivered', quantity: 3, rating: 5, notes: 'Delivered on time' })
      .expect(201);

    const state = await withTenant(db, { tenantId: ACME }, async (tx) => ({
      bidRows: await tx.select().from(bids).where(eq(bids.sourcingLineId, sourcingLineId)),
      poRows: await tx.select().from(purchaseOrders).where(eq(purchaseOrders.sourcingLineId, sourcingLineId)),
      vendorRows: await tx.select().from(suppliers).where(eq(suppliers.platformSupplierId, platformSupplierId)),
      lineRows: await tx.select().from(sourcingLines).where(eq(sourcingLines.id, sourcingLineId)),
      requestRows: await tx.select().from(sourcingRequests).where(eq(sourcingRequests.id, sourcingRequestId)),
    }));
    expect(state.bidRows.find((bid) => bid.id === submittedBidId)?.status).toBe('accepted');
    expect(state.bidRows.find((bid) => bid.id === losingBid.body.bidId)?.status).toBe('rejected');
    expect(state.poRows).toEqual([expect.objectContaining({ acceptedBidId: submittedBidId, status: 'delivered', unitPrice: '440.00' })]);
    expect(state.vendorRows).toEqual([expect.objectContaining({ sourceSystem: 'marketplace', email })]);
    expect(state.lineRows[0]?.status).toBe('awarded');
    expect(state.requestRows[0]?.status).toBe('closed');
    const outcomes = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(purchaseOrderOutcomes).where(eq(purchaseOrderOutcomes.purchaseOrderId, award.body.purchaseOrderId)));
    expect(outcomes).toEqual([expect.objectContaining({ type: 'delivered', quantity: '3.000', rating: 5, notes: 'Delivered on time' })]);
    const buyerDetail = await http.get(`/api/sourcing-requests/${sourcingRequestId}`).set(as('bob')).expect(200);
    expect(buyerDetail.body.lines[0].purchaseOrder).toMatchObject({ id: award.body.purchaseOrderId, status: 'delivered', outcomes: [expect.objectContaining({ type: 'delivered' })] });
    expect(buyerDetail.body.lines[0]).toMatchObject({
      priceIntelligence: { benchmark: null, privacyThreshold: { minimumQuotes: 5, minimumBuyers: 3, met: false } },
      bids: expect.arrayContaining([expect.objectContaining({ supplierScore: expect.objectContaining({ overallScore: expect.any(Number), components: expect.any(Object) }), landedUnitCost: expect.any(Number) })]),
    });

    const winnerView = await http.get('/api/supplier/bids').set(supplierAuth()).expect(200);
    expect(winnerView.body[0]).toMatchObject({ bidId: submittedBidId, status: 'accepted', buyer: { name: expect.any(String), contactEmail: expect.any(String) } });

    const loserView = await http.get('/api/supplier/bids').set(losingAuth).expect(200);
    expect(loserView.body[0]).toMatchObject({ bidId: losingBid.body.bidId, status: 'rejected', buyer: null });
    const loserPayload = JSON.stringify(loserView.body).toLowerCase();
    for (const forbidden of ['acme', 'buyer contact', '@acme']) expect(loserPayload).not.toContain(forbidden);

    await http
      .post(`/api/sourcing-requests/${sourcingRequestId}/lines/${sourcingLineId}/bids/${losingBid.body.bidId}/accept`)
      .set(as('bob'))
      .expect(409);
  });
});
