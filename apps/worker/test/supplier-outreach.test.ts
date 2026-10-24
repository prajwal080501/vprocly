import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@vprocly/contracts';
import {
  categories,
  createDatabase,
  createPool,
  outbox,
  platformSuppliers,
  sourcingLineNotifications,
  sourcingLines,
  sourcingRequests,
  supplierVoiceCalls,
  withTenant,
} from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { handleEvent } from '../src/consumer.js';
import { supplierOutreachRouter } from '../src/consumers/supplier-outreach-router.js';
import { supplierVoiceCaller } from '../src/consumers/supplier-voice-caller.js';
import type { CampaignClient, CohortMember } from '../src/voice/sarvam-campaign-client.js';
import type { VoiceCallClient } from '../src/voice/sarvam-client.js';

const ACME = '11111111-1111-4111-8111-111111111111';
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);

afterAll(async () => pool.end());

async function seed(phone: string | null, { manualInvite = false }: { manualInvite?: boolean } = {}) {
  const [category] = await db.insert(categories).values({ name: `Voice Test ${randomUUID()}` }).returning();
  const [supplier] = await db
    .insert(platformSuppliers)
    .values({ name: 'Voice Supplier', gst: null, email: `voice-${randomUUID()}@example.com`, phone, city: 'Pune', state: 'Maharashtra', status: 'prospect' })
    .returning();
  return withTenant(db, { tenantId: ACME }, async (tx) => {
    const [request] = await tx.insert(sourcingRequests).values({ tenantId: ACME, title: 'Voice test', source: 'manual' }).returning();
    const [line] = await tx.insert(sourcingLines).values({
      tenantId: ACME,
      sourcingRequestId: request!.id,
      description: 'Precision bearing',
      categoryId: category!.id,
      qty: '10.000',
      uom: 'NOS',
      deliveryCity: 'Pune',
      deliveryState: 'Maharashtra',
    }).returning();
    const [notification] = await tx.insert(sourcingLineNotifications).values({
      tenantId: ACME,
      sourcingLineId: line!.id,
      platformSupplierId: manualInvite ? null : supplier!.id,
      email: supplier!.email,
    }).returning();
    return { lineId: line!.id, notificationId: notification!.id };
  });
}

function event(type: string, aggregateId: string, payload: Record<string, unknown>): EventEnvelope {
  return { id: randomUUID(), type, version: 1, tenantId: ACME, aggregateType: 'test', aggregateId, occurredAt: new Date().toISOString(), correlationId: null, actorId: null, payload };
}

function fakeCampaign(): CampaignClient & { added: CohortMember[] } {
  return {
    added: [] as CohortMember[],
    async ensureCampaign() {
      return { campaignId: 'campaign-test' };
    },
    async addToCohort(_campaignId: string, members: CohortMember[]) {
      this.added.push(...members);
    },
  };
}

describe('supplier voice outreach', () => {
  it('routes buyer-entered invite emails to the live manual mailer in every delivery mode', async () => {
    const seeded = await seed(null, { manualInvite: true });
    const matched = event('sourcing.sourcing_line_matched', seeded.lineId, { sourcingLineId: seeded.lineId, matchedSupplierCount: 0, invitedNewCount: 1 });
    await handleEvent(db, supplierOutreachRouter({ db, voiceMode: 'capture' }), matched);

    const events = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(eq(outbox.aggregateId, seeded.notificationId)),
    );
    expect(events.filter((row) => row.eventType === 'sourcing.supplier_manual_email_requested')).toHaveLength(1);
    expect(events.filter((row) => row.eventType === 'sourcing.supplier_email_requested')).toHaveLength(0);
  });

  it('queues a notification call and the bidding email when a phone is available', async () => {
    const seeded = await seed('+919876543210');
    const campaign = fakeCampaign();
    const matched = event('sourcing.sourcing_line_matched', seeded.lineId, { sourcingLineId: seeded.lineId, matchedSupplierCount: 0, invitedNewCount: 1 });
    expect(await handleEvent(db, supplierOutreachRouter({ db, voiceMode: 'live', campaign, campaignId: 'campaign-test' }), matched)).toBe('processed');

    expect(campaign.added).toHaveLength(1);
    expect(campaign.added[0]).toMatchObject({
      userPhoneNumber: '+919876543210',
      appVariables: {
        buyer_company_name: expect.any(String),
        supplier_name: 'Voice Supplier',
      },
    });
    expect(campaign.added[0]!.appVariables.buyer_company_name).not.toBe('');
    expect(campaign.added[0]!.appVariables.item_description).toContain('check their email for the secure bidding link');
    expect(campaign.added[0]!.userIdentifier).toMatch(new RegExp(`^${ACME}:[0-9a-f-]{36}$`));

    const [call] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.notificationId, seeded.notificationId)));
    expect(call).toMatchObject({ status: 'queued', phone: '+919876543210' });
    // No Instant Outbound event for the automatic path anymore -- Sarvam's own campaign scheduler dials.
    const callEvents = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.supplier_call_requested'), eq(outbox.aggregateId, call!.id))),
    );
    expect(callEvents).toHaveLength(0);
    const [emailEvent] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.supplier_email_requested'), eq(outbox.aggregateId, seeded.notificationId))),
    );
    expect(emailEvent?.payload).toMatchObject({ reason: 'call_notification' });
  });

  it('falls back to email without touching the campaign when Sarvam is unconfigured, even in live mode', async () => {
    const seeded = await seed('+919876543214');
    const matched = event('sourcing.sourcing_line_matched', seeded.lineId, { sourcingLineId: seeded.lineId, matchedSupplierCount: 0, invitedNewCount: 1 });
    // voiceMode: 'live' but no campaign/campaignId -- must degrade to capture-like behavior, not crash.
    await handleEvent(db, supplierOutreachRouter({ db, voiceMode: 'live' }), matched);

    const [call] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.notificationId, seeded.notificationId)));
    expect(call).toMatchObject({ status: 'skipped' });
  });

  it('falls back to email without placing a call in capture mode', async () => {
    const seeded = await seed('+919876543211');
    const matched = event('sourcing.sourcing_line_matched', seeded.lineId, { sourcingLineId: seeded.lineId, matchedSupplierCount: 0, invitedNewCount: 1 });
    await handleEvent(db, supplierOutreachRouter({ db, voiceMode: 'capture' }), matched);

    const [call] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.notificationId, seeded.notificationId)));
    expect(call).toMatchObject({ status: 'skipped' });
    const [emailEvent] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.supplier_email_requested'), eq(outbox.aggregateId, seeded.notificationId))),
    );
    expect(emailEvent?.payload).toMatchObject({ reason: 'voice_disabled' });
  });

  it('stores the Sarvam attempt id, and provider failures request email fallback', async () => {
    const seeded = await seed('+919876543212');
    const [call] = await withTenant(db, { tenantId: ACME }, (tx) => tx.insert(supplierVoiceCalls).values({
      tenantId: ACME,
      notificationId: seeded.notificationId,
      sourcingLineId: seeded.lineId,
      phone: '+919876543212',
    }).returning());
    const callRequested = event('sourcing.supplier_call_requested', call!.id, { voiceCallId: call!.id, notificationId: seeded.notificationId, sourcingLineId: seeded.lineId });
    let buyerCompanyName = '';
    const voice: VoiceCallClient = { async createCall(request) { buyerCompanyName = request.buyerCompanyName; return { attemptId: `attempt-${randomUUID()}` }; } };
    await handleEvent(db, supplierVoiceCaller({ db, voice }), callRequested);
    expect(buyerCompanyName).not.toBe('');
    const [started] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.id, call!.id)));
    expect(started).toMatchObject({ status: 'dialing' });
    expect(started!.attemptId).toMatch(/^attempt-/);

    const failedSeed = await seed('+919876543213');
    const [failedCall] = await withTenant(db, { tenantId: ACME }, (tx) => tx.insert(supplierVoiceCalls).values({ tenantId: ACME, notificationId: failedSeed.notificationId, sourcingLineId: failedSeed.lineId, phone: '+919876543213' }).returning());
    const failingVoice: VoiceCallClient = { async createCall() { throw new Error('provider unavailable'); } };
    await handleEvent(db, supplierVoiceCaller({ db, voice: failingVoice }), event('sourcing.supplier_call_requested', failedCall!.id, { voiceCallId: failedCall!.id, notificationId: failedSeed.notificationId, sourcingLineId: failedSeed.lineId }));
    const [failed] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.id, failedCall!.id)));
    expect(failed).toMatchObject({ status: 'failed' });
    const [emailEvent] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.supplier_email_requested'), eq(outbox.aggregateId, failedSeed.notificationId))));
    expect(emailEvent?.payload).toMatchObject({ reason: 'call_failed' });
  });
});
