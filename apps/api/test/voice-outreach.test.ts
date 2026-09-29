import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
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
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

const ACME = '11111111-1111-4111-8111-111111111111';
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);
let app: INestApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  app = await createTestApp();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
  await pool.end();
});

async function seedVoiceCall() {
  const [category] = await db.select().from(categories).limit(1);
  const [supplier] = await db.insert(platformSuppliers).values({
    name: 'Webhook Voice Supplier',
    gst: null,
    email: `webhook-${randomUUID()}@example.com`,
    phone: '+919876543210',
    city: 'Pune',
    state: 'Maharashtra',
    status: 'prospect',
  }).returning();
  return withTenant(db, { tenantId: ACME }, async (tx) => {
    const [requestRow] = await tx.insert(sourcingRequests).values({ tenantId: ACME, title: 'Webhook test', source: 'manual' }).returning();
    const [line] = await tx.insert(sourcingLines).values({
      tenantId: ACME,
      sourcingRequestId: requestRow!.id,
      description: 'Webhook test item',
      categoryId: category!.id,
      qty: '1.000',
      uom: 'NOS',
      deliveryCity: 'Pune',
      deliveryState: 'Maharashtra',
    }).returning();
    const [notification] = await tx.insert(sourcingLineNotifications).values({
      tenantId: ACME,
      sourcingLineId: line!.id,
      platformSupplierId: supplier!.id,
      email: supplier!.email,
    }).returning();
    const [call] = await tx.insert(supplierVoiceCalls).values({
      tenantId: ACME,
      notificationId: notification!.id,
      sourcingLineId: line!.id,
      platformSupplierId: supplier!.id,
      phone: supplier!.phone!,
      status: 'dialing',
      startedAt: new Date(),
    }).returning();
    return { callId: call!.id, notificationId: notification!.id };
  });
}

function webhookBody(callId: string, status: 'connected' | 'no_answer') {
  return {
    attempt_id: `attempt-${randomUUID()}`,
    status,
    channel_info: { channel_type: 'v2v', channel_provider: 'exotel', agent_phone_number: '+918000000000' },
    duration: status === 'connected' ? 18.5 : null,
    interaction_id: status === 'connected' ? `interaction-${randomUUID()}` : null,
    failure_reason: null,
    final_agent_variables: status === 'connected' ? { supplier_name: 'Test supplier' } : null,
    output_agent_variables: status === 'connected' ? {
      call_disposition: 'rate_and_lead_time_confirmed',
      call_summary: 'Supplier confirmed the requested commercial details.',
      lead_time: '12 days',
      moq: '100 units',
      moq_rate: 'INR 245.50 per unit',
    } : null,
    webhook_config: { url: 'https://example.test/webhook', metadata: { tenant_id: ACME, voice_call_id: callId } },
    interaction_transcript: status === 'connected' ? [
      { role: 'agent', en_text: 'Can you supply this item?' },
      { role: 'user', en_text: 'Yes, in twelve days.' },
    ] : null,
  };
}

describe('Sarvam voice outcome webhook', () => {
  it('suppresses email after a connected call', async () => {
    const seeded = await seedVoiceCall();
    await http.post(`/api/webhooks/sarvam/instant-outbound/${process.env.SARVAM_WEBHOOK_SECRET}`).send(webhookBody(seeded.callId, 'connected')).expect(200);
    const state = await withTenant(db, { tenantId: ACME }, async (tx) => ({
      call: (await tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.id, seeded.callId)))[0],
      emailEvents: await tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.supplier_email_requested'), eq(outbox.aggregateId, seeded.notificationId))),
    }));
    expect(state.call).toMatchObject({
      status: 'connected',
      durationSeconds: '18.50',
      finalAgentVariables: {
        supplier_name: 'Test supplier',
        call_disposition: 'rate_and_lead_time_confirmed',
        call_summary: 'Supplier confirmed the requested commercial details.',
        lead_time: '12 days',
        moq: '100 units',
        moq_rate: 'INR 245.50 per unit',
      },
      interactionTranscript: [
        { role: 'agent', enText: 'Can you supply this item?' },
        { role: 'user', enText: 'Yes, in twelve days.' },
      ],
    });
    expect(state.emailEvents).toHaveLength(0);
  });

  it('enriches a completed call when Sarvam redelivers output variables', async () => {
    const seeded = await seedVoiceCall();
    const initial = webhookBody(seeded.callId, 'connected');
    initial.final_agent_variables = null;
    initial.output_agent_variables = null;
    initial.interaction_transcript = null;
    const url = `/api/webhooks/sarvam/instant-outbound/${process.env.SARVAM_WEBHOOK_SECRET}`;

    await http.post(url).send(initial).expect(200, { accepted: true, duplicate: false });
    const enriched = webhookBody(seeded.callId, 'connected');
    enriched.attempt_id = initial.attempt_id;
    await http.post(url).send(enriched).expect(200, { accepted: true, duplicate: true });

    const [call] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.id, seeded.callId)),
    );
    expect(call?.finalAgentVariables).toMatchObject({
      call_disposition: 'rate_and_lead_time_confirmed',
      lead_time: '12 days',
      moq: '100 units',
      moq_rate: 'INR 245.50 per unit',
    });
    expect(call?.interactionTranscript).toHaveLength(2);
  });

  it('requests the bidding email after no answer and is idempotent', async () => {
    const seeded = await seedVoiceCall();
    const body = webhookBody(seeded.callId, 'no_answer');
    const url = `/api/webhooks/sarvam/instant-outbound/${process.env.SARVAM_WEBHOOK_SECRET}`;
    await http.post(url).send(body).expect(200);
    await http.post(url).send(body).expect(200, { accepted: true, duplicate: true });
    const emailEvents = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.supplier_email_requested'), eq(outbox.aggregateId, seeded.notificationId))),
    );
    expect(emailEvents).toHaveLength(1);
    expect(emailEvents[0]!.payload).toMatchObject({ reason: 'no_answer' });
  });

  it('rejects an invalid callback secret', async () => {
    const seeded = await seedVoiceCall();
    await http.post('/api/webhooks/sarvam/instant-outbound/not-the-secret').send(webhookBody(seeded.callId, 'connected')).expect(401);
  });

  it('also correlates via user_identifier for the batch/campaign path, which carries no per-call metadata', async () => {
    const seeded = await seedVoiceCall();
    const body = {
      attempt_id: `attempt-${randomUUID()}`,
      status: 'connected' as const,
      duration: 12.3,
      interaction_id: `interaction-${randomUUID()}`,
      failure_reason: null,
      user_identifier: `${ACME}:${seeded.callId}`,
    };
    await http.post(`/api/webhooks/sarvam/instant-outbound/${process.env.SARVAM_WEBHOOK_SECRET}`).send(body).expect(200);
    const [call] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.id, seeded.callId)));
    expect(call).toMatchObject({ status: 'connected', durationSeconds: '12.30' });
  });

  it('rejects a webhook with neither metadata nor a parseable user_identifier', async () => {
    await http
      .post(`/api/webhooks/sarvam/instant-outbound/${process.env.SARVAM_WEBHOOK_SECRET}`)
      .send({ attempt_id: `attempt-${randomUUID()}`, status: 'connected' })
      .expect(404);
  });
});
