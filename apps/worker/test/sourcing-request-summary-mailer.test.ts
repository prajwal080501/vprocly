import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@vprocly/contracts';
import { createDatabase, createPool, users, withTenant } from '@vprocly/db';
import nodemailer from 'nodemailer';
import { afterAll, describe, expect, it } from 'vitest';
import { handleEvent } from '../src/consumer.js';
import { sourcingRequestSummaryMailer } from '../src/consumers/sourcing-request-summary-mailer.js';

// Runs against the dev stack (Postgres + Mailpit).
const ACME = '11111111-1111-4111-8111-111111111111';
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:58025';
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);
const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? 'localhost', port: Number(process.env.SMTP_PORT ?? 51025), secure: false });
const mailers = { rfq: transport, rfqFrom: 'vProcly RFQ <rfq@vprocly.example>', noreply: transport, noreplyFrom: 'vProcly <noreply@vprocly.example>' };
const consumer = sourcingRequestSummaryMailer({ db, mailers, publicWebUrl: 'http://localhost:3000' });

afterAll(async () => {
  await pool.end();
});

async function seedBuyer(email: string): Promise<string> {
  return withTenant(db, { tenantId: ACME }, async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({ tenantId: ACME, subject: `test-${randomUUID()}`, email, displayName: 'Test Buyer' })
      .returning({ id: users.id });
    return row!.id;
  });
}

function matchedEvent(actorId: string | null, overrides: Partial<EventEnvelope['payload']> = {}): EventEnvelope {
  return {
    id: randomUUID(),
    type: 'sourcing.sourcing_request_matched',
    version: 1,
    tenantId: ACME,
    aggregateType: 'sourcing_request',
    aggregateId: randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: null,
    actorId,
    payload: { sourcingRequestId: randomUUID(), title: 'Summary test request', lineCount: 2, matchedSupplierCount: 3, invitedNewCount: 1, ...overrides },
  };
}

/** Polls briefly: Mailpit's REST API can lag a moment behind its own SMTP acceptance of the message. */
async function lastMailpitMessageTo(email: string): Promise<{ Text: string; From: { Address: string } } | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = (await (await fetch(`${MAILPIT_API}/api/v1/messages`)).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const hit = list.messages.find((m) => m.To.some((t) => t.Address === email));
    if (hit) return (await (await fetch(`${MAILPIT_API}/api/v1/message/${hit.ID}`)).json()) as { Text: string; From: { Address: string } };
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

describe('sourcing request summary mailer', () => {
  it('sends the buyer a summary from the noreply identity, never the rfq one suppliers see', async () => {
    const email = `buyer-${randomUUID().slice(0, 8)}@example.com`;
    const actorId = await seedBuyer(email);

    expect(await handleEvent(db, consumer, matchedEvent(actorId))).toBe('processed');

    const msg = await lastMailpitMessageTo(email);
    expect(msg).not.toBeNull();
    expect(msg!.From.Address).toBe('noreply@vprocly.example');
    expect(msg!.Text).toContain('Summary test request');
    expect(msg!.Text).toContain('3'); // matchedSupplierCount
    expect(msg!.Text).toContain('1'); // invitedNewCount
  });

  it('does nothing when there is no actor (no buyer to notify)', async () => {
    // No throw, no crash -- just nothing to send.
    expect(await handleEvent(db, consumer, matchedEvent(null))).toBe('processed');
  });

  it('does nothing when the actor has no email on record', async () => {
    const actorId = await withTenant(db, { tenantId: ACME }, async (tx) => {
      const [row] = await tx.insert(users).values({ tenantId: ACME, subject: `test-${randomUUID()}` }).returning({ id: users.id });
      return row!.id;
    });
    expect(await handleEvent(db, consumer, matchedEvent(actorId))).toBe('processed');
  });
});
