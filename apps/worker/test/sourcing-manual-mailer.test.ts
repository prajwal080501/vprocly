import { randomUUID } from 'node:crypto';
import { hashInviteToken, type EventEnvelope } from '@vprocly/contracts';
import { categories, createDatabase, createPool, sourcingLineNotifications, sourcingLines, sourcingRequests, withTenant } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { afterAll, describe, expect, it } from 'vitest';
import { handleEvent } from '../src/consumer.js';
import { sourcingManualMailer } from '../src/consumers/sourcing-manual-mailer.js';

// Runs against the dev stack (Postgres + Mailpit, standing in for "the live provider" in tests).
const ACME = '11111111-1111-4111-8111-111111111111';
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:58025';
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);
const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? 'localhost', port: Number(process.env.SMTP_PORT ?? 51025), secure: false });
const liveMailers = { rfq: transport, rfqFrom: 'vProcly RFQ <rfq@vprocly.example>', noreply: transport, noreplyFrom: 'vProcly <noreply@vprocly.example>', liveRfq: transport, liveRfqFrom: 'vProcly RFQ <rfq@vprocly.example>' };
const consumer = sourcingManualMailer({ db, mailers: liveMailers, publicWebUrl: 'http://localhost:3000' });

afterAll(async () => {
  await pool.end();
});

async function seedNotification(email: string, { alreadySent }: { alreadySent: boolean }) {
  const [category] = await db.select().from(categories).limit(1);
  return withTenant(db, { tenantId: ACME }, async (tx) => {
    const [request] = await tx.insert(sourcingRequests).values({ tenantId: ACME, title: 'Manual mailer test', source: 'manual' }).returning();
    const [line] = await tx
      .insert(sourcingLines)
      .values({
        tenantId: ACME,
        sourcingRequestId: request!.id,
        itemCode: 'MM-001',
        description: 'Manual mailer test item',
        categoryId: category!.id,
        qty: '1.000',
        uom: 'NOS',
        deliveryCity: 'TestCity',
        deliveryState: 'TestState',
      })
      .returning();
    const [notification] = await tx
      .insert(sourcingLineNotifications)
      .values({ tenantId: ACME, sourcingLineId: line!.id, email, sentAt: alreadySent ? new Date() : null })
      .returning();
    return { lineId: line!.id, notificationId: notification!.id };
  });
}

function manualEmailEvent(sourcingLineId: string, notificationId: string): EventEnvelope {
  return {
    id: randomUUID(),
    type: 'sourcing.supplier_manual_email_requested',
    version: 1,
    tenantId: ACME,
    aggregateType: 'sourcing_line_notification',
    aggregateId: notificationId,
    occurredAt: new Date().toISOString(),
    correlationId: null,
    actorId: null,
    payload: { sourcingLineId, notificationId },
  };
}

async function lastMailpitMessageTo(email: string): Promise<{ Text: string; HTML: string; From: { Address: string } } | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = (await (await fetch(`${MAILPIT_API}/api/v1/messages`)).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const hit = list.messages.find((m) => m.To.some((t) => t.Address === email));
    if (hit) return (await (await fetch(`${MAILPIT_API}/api/v1/message/${hit.ID}`)).json()) as { Text: string; HTML: string; From: { Address: string } };
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

describe('sourcing manual mailer', () => {
  it('sends for real even when the notification already shows sentAt (a prior capture-mode auto-send)', async () => {
    const email = `manual-${randomUUID().slice(0, 8)}@example.com`;
    const { lineId, notificationId } = await seedNotification(email, { alreadySent: true });

    expect(await handleEvent(db, consumer, manualEmailEvent(lineId, notificationId))).toBe('processed');

    const msg = await lastMailpitMessageTo(email);
    expect(msg).not.toBeNull();
    expect(msg!.Text).toContain('Manual mailer test item');
    expect(msg!.From.Address).toBe('rfq@vprocly.example');

    const link = msg!.Text.match(/supplier\/invite\/(\S+)/)?.[1];
    const [row] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(sourcingLineNotifications).where(eq(sourcingLineNotifications.id, notificationId)));
    expect(row!.tokenHash).toBe(hashInviteToken(link!));
  });

  it('throws clearly when no live transport is configured, instead of silently doing nothing', async () => {
    const email = `manual-${randomUUID().slice(0, 8)}@example.com`;
    const { lineId, notificationId } = await seedNotification(email, { alreadySent: false });
    const noLiveConsumer = sourcingManualMailer({
      db,
      mailers: { rfq: transport, rfqFrom: 'x', noreply: transport, noreplyFrom: 'x', liveRfqFrom: 'x' },
      publicWebUrl: 'http://localhost:3000',
    });

    await expect(handleEvent(db, noLiveConsumer, manualEmailEvent(lineId, notificationId))).rejects.toThrow(/Live email is not configured/);
  });

  it('is idempotent per event id via the inbox (exact redelivery of the same event is skipped entirely)', async () => {
    const email = `manual-${randomUUID().slice(0, 8)}@example.com`;
    const { lineId, notificationId } = await seedNotification(email, { alreadySent: false });
    const event = manualEmailEvent(lineId, notificationId);

    expect(await handleEvent(db, consumer, event)).toBe('processed');
    expect(await handleEvent(db, consumer, event)).toBe('duplicate');
  });
});
