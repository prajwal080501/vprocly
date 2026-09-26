import { randomUUID } from 'node:crypto';
import { hashInviteToken, type EventEnvelope } from '@vprocly/contracts';
import { categories, createDatabase, createPool, sourcingLineNotifications, sourcingLines, sourcingRequests, withTenant } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { afterAll, describe, expect, it } from 'vitest';
import { handleEvent } from '../src/consumer.js';
import { sourcingInviteMailer } from '../src/consumers/sourcing-invite-mailer.js';

// Runs against the dev stack (Postgres + Mailpit).
const ACME = '11111111-1111-4111-8111-111111111111';
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:58025';
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);
const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? 'localhost', port: Number(process.env.SMTP_PORT ?? 51025), secure: false });
const mailers = { rfq: transport, rfqFrom: 'vProcly RFQ <rfq@vprocly.example>', noreply: transport, noreplyFrom: 'vProcly <noreply@vprocly.example>' };
const deps = { db, mailers, publicWebUrl: 'http://localhost:3000' };
const consumer = sourcingInviteMailer(deps);

afterAll(async () => {
  await pool.end();
});

async function seedLineWithPendingNotification(email: string) {
  const [category] = await db.select().from(categories).limit(1);
  return withTenant(db, { tenantId: ACME }, async (tx) => {
    const [request] = await tx.insert(sourcingRequests).values({ tenantId: ACME, title: 'Mailer test', source: 'manual' }).returning();
    const [line] = await tx
      .insert(sourcingLines)
      .values({
        tenantId: ACME,
        sourcingRequestId: request!.id,
        description: 'Mailer test item',
        categoryId: category!.id,
        qty: '3.000',
        uom: 'NOS',
        deliveryCity: 'TestCity',
        deliveryState: 'TestState',
      })
      .returning();
    const [notification] = await tx.insert(sourcingLineNotifications).values({ tenantId: ACME, sourcingLineId: line!.id, email }).returning();
    return { lineId: line!.id, notificationId: notification!.id };
  });
}

function matchedEvent(sourcingLineId: string): EventEnvelope {
  return {
    id: randomUUID(),
    type: 'sourcing.sourcing_line_matched',
    version: 1,
    tenantId: ACME,
    aggregateType: 'sourcing_line',
    aggregateId: sourcingLineId,
    occurredAt: new Date().toISOString(),
    correlationId: null,
    actorId: null,
    payload: { sourcingLineId, matchedSupplierCount: 0, invitedNewCount: 1 },
  };
}

/** Polls briefly: Mailpit's REST API can lag a moment behind its own SMTP acceptance of the message. */
async function lastMailpitMessageTo(email: string): Promise<{ Text: string; ID: string; From: { Address: string } } | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = (await (await fetch(`${MAILPIT_API}/api/v1/messages`)).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const hit = list.messages.find((m) => m.To.some((t) => t.Address === email));
    if (hit) return (await (await fetch(`${MAILPIT_API}/api/v1/message/${hit.ID}`)).json()) as { Text: string; ID: string; From: { Address: string } };
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

describe('sourcing invite mailer', () => {
  it('sends the invite email with a working token, and never mentions the buyer/tenant', async () => {
    const email = `mailer-${randomUUID().slice(0, 8)}@example.com`;
    const { lineId, notificationId } = await seedLineWithPendingNotification(email);

    expect(await handleEvent(db, consumer, matchedEvent(lineId))).toBe('processed');

    const msg = await lastMailpitMessageTo(email);
    expect(msg).not.toBeNull();
    expect(msg!.Text).toContain('Mailer test item');
    expect(msg!.Text.toLowerCase()).not.toMatch(/acme|tenant|buyer/);
    expect(msg!.From.Address).toBe('rfq@vprocly.example'); // the rfq identity, never noreply

    const link = msg!.Text.match(/supplier\/invite\/(\S+)/)?.[1];
    expect(link).toBeDefined();

    const [row] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingLineNotifications).where(eq(sourcingLineNotifications.id, notificationId)),
    );
    expect(row!.sentAt).toBeInstanceOf(Date);
    expect(row!.tokenHash).toBe(hashInviteToken(link!));
    expect(row!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not re-send once already sent (redelivery of the same fully-processed event is a no-op)', async () => {
    const email = `mailer-${randomUUID().slice(0, 8)}@example.com`;
    const { lineId } = await seedLineWithPendingNotification(email);

    await handleEvent(db, consumer, matchedEvent(lineId));
    const first = await lastMailpitMessageTo(email);

    // A second, distinct event delivery for the same line finds no pending (unsent) notifications left.
    expect(await handleEvent(db, consumer, matchedEvent(lineId))).toBe('processed');
    const list = (await (await fetch(`${MAILPIT_API}/api/v1/messages`)).json()) as { messages: { To: { Address: string }[] }[] };
    expect(list.messages.filter((m) => m.To.some((t) => t.Address === email))).toHaveLength(1);
    expect(first).not.toBeNull();
  });

  it('is idempotent per event id via the inbox (exact redelivery of the same event is skipped entirely)', async () => {
    const email = `mailer-${randomUUID().slice(0, 8)}@example.com`;
    const { lineId } = await seedLineWithPendingNotification(email);
    const event = matchedEvent(lineId);

    expect(await handleEvent(db, consumer, event)).toBe('processed');
    expect(await handleEvent(db, consumer, event)).toBe('duplicate');
  });
});
