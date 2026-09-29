import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@vprocly/contracts';
import { bids, categories, createDatabase, createPool, platformSuppliers, sourcingLines, sourcingRequests, tenants, users, withTenant } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { afterAll, describe, expect, it } from 'vitest';
import { handleEvent } from '../src/consumer.js';
import { sourcingAwardMailer } from '../src/consumers/sourcing-award-mailer.js';

const ACME = '11111111-1111-4111-8111-111111111111';
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:58025';
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);
const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? 'localhost', port: Number(process.env.SMTP_PORT ?? 51025), secure: false });
const mailers = { rfq: transport, rfqFrom: 'vProcly RFQ <rfq@vprocly.example>', noreply: transport, noreplyFrom: 'vProcly <noreply@vprocly.example>', liveRfq: transport, liveRfqFrom: 'vProcly RFQ <rfq@vprocly.example>' };
const consumer = sourcingAwardMailer({ db, mailers, publicWebUrl: 'http://localhost:3000' });

afterAll(async () => pool.end());

async function lastMailTo(email: string): Promise<{ Text: string } | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = (await (await fetch(`${MAILPIT_API}/api/v1/messages`)).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const hit = list.messages.find((message) => message.To.some((to) => to.Address === email));
    if (hit) return (await (await fetch(`${MAILPIT_API}/api/v1/message/${hit.ID}`)).json()) as { Text: string };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

describe('sourcing award mailer', () => {
  it('reveals the buyer to the winner and sends no buyer identity to the rejected supplier', async () => {
    const suffix = randomUUID().slice(0, 8);
    const winnerEmail = `award-winner-${suffix}@example.com`;
    const loserEmail = `award-loser-${suffix}@example.com`;
    const [winner] = await db.insert(platformSuppliers).values({ name: 'Award Winner', gst: `WIN-${suffix}`, email: winnerEmail, city: 'Pune', state: 'Maharashtra' }).returning();
    const [loser] = await db.insert(platformSuppliers).values({ name: 'Award Runner Up', gst: `LOSE-${suffix}`, email: loserEmail, city: 'Pune', state: 'Maharashtra' }).returning();

    const seeded = await withTenant(db, { tenantId: ACME }, async (tx) => {
      const [category] = await tx.select().from(categories).limit(1);
      const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, ACME));
      const [buyer] = await tx.insert(users).values({ tenantId: ACME, subject: `award-${suffix}`, email: `buyer-${suffix}@example.com`, displayName: 'Award Buyer' }).returning();
      const [request] = await tx.insert(sourcingRequests).values({ tenantId: ACME, title: `Award ${suffix}`, source: 'manual', createdBy: buyer!.id }).returning();
      const [line] = await tx.insert(sourcingLines).values({ tenantId: ACME, sourcingRequestId: request!.id, description: `Award item ${suffix}`, categoryId: category!.id, qty: '5', uom: 'NOS', deliveryCity: 'Pune', deliveryState: 'Maharashtra', createdBy: buyer!.id }).returning();
      const [winnerBid] = await tx.insert(bids).values({ tenantId: ACME, sourcingLineId: line!.id, platformSupplierId: winner!.id, unitPrice: '10', status: 'accepted' }).returning();
      await tx.insert(bids).values({ tenantId: ACME, sourcingLineId: line!.id, platformSupplierId: loser!.id, unitPrice: '12', status: 'rejected' });
      return { lineId: line!.id, bidId: winnerBid!.id, buyerName: tenant!.name };
    });

    const event: EventEnvelope = {
      id: randomUUID(), type: 'sourcing.bid_accepted', version: 1, tenantId: ACME,
      aggregateType: 'sourcing_line', aggregateId: seeded.lineId, occurredAt: new Date().toISOString(),
      correlationId: null, actorId: null,
      payload: { sourcingRequestId: randomUUID(), sourcingLineId: seeded.lineId, acceptedBidId: seeded.bidId, platformSupplierId: winner!.id, purchaseOrderId: randomUUID() },
    };
    expect(await handleEvent(db, consumer, event)).toBe('processed');

    const winnerMessage = await lastMailTo(winnerEmail);
    const loserMessage = await lastMailTo(loserEmail);
    expect(winnerMessage?.Text).toContain(seeded.buyerName);
    expect(winnerMessage?.Text).toContain('Award Buyer');
    expect(loserMessage?.Text).toContain('Another bid was selected');
    expect(loserMessage?.Text).not.toContain(seeded.buyerName);
    expect(loserMessage?.Text).not.toContain('Award Buyer');
  });
});
