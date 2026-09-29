import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@vprocly/contracts';
import {
  categories,
  createDatabase,
  createPool,
  outbox,
  platformSuppliers,
  sourcingLines,
  sourcingResearchJobs,
  sourcingRequests,
  supplierCategories,
  supplierResearchRuns,
  withTenant,
} from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { handleEvent } from '../src/consumer.js';
import { supplierResearchAgent } from '../src/consumers/supplier-research-agent.js';
import type { SupplierCandidate, SupplierResearchClient } from '../src/research/supplier-research-client.js';

// Runs against the dev stack (Postgres). No real Gemini/Places calls -- the research client is a fake, per
// the plan's rationale: there's no self-hostable equivalent to run in CI, and hitting the real APIs here
// would reintroduce exactly the cost/non-determinism problem this design exists to avoid.
const ACME = '11111111-1111-4111-8111-111111111111';
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);

afterAll(async () => {
  await pool.end();
});

function fakeCandidate(overrides: Partial<SupplierCandidate> = {}): SupplierCandidate {
  return {
    name: 'Acme Fasteners',
    email: `prospect-${randomUUID().slice(0, 8)}@example.com`,
    phone: null,
    city: 'TestCity',
    state: 'TestState',
    country: 'IN',
    website: null,
    placeId: 'fake-place-id',
    sourceUrls: [],
    searchQuery: 'fake',
    ...overrides,
  };
}

function researchClientReturning(candidates: SupplierCandidate[]): SupplierResearchClient & { calls: number } {
  const client = {
    calls: 0,
    async findSuppliers() {
      client.calls++;
      return candidates;
    },
  };
  return client;
}

async function seedUnmatchedCategory() {
  const [category] = await db.insert(categories).values({ name: `Research Test ${randomUUID().slice(0, 8)}` }).returning();
  return category!.id;
}

async function seedUnmatchedLine(categoryId: string) {
  return withTenant(db, { tenantId: ACME }, async (tx) => {
    const [request] = await tx.insert(sourcingRequests).values({ tenantId: ACME, title: 'Research test', source: 'manual' }).returning();
    const [line] = await tx
      .insert(sourcingLines)
      .values({
        tenantId: ACME,
        sourcingRequestId: request!.id,
        itemCode: 'RT-001',
        description: 'Unmatched research test item',
        categoryId,
        qty: '2.000',
        uom: 'NOS',
        deliveryCity: 'TestCity',
        deliveryState: 'TestState',
      })
      .returning();
    return line!.id;
  });
}

function unmatchedEvent(sourcingLineId: string, categoryId: string, neededSupplierCount?: number): EventEnvelope {
  return {
    id: randomUUID(),
    type: 'sourcing.sourcing_line_unmatched',
    version: 1,
    tenantId: ACME,
    aggregateType: 'sourcing_line',
    aggregateId: sourcingLineId,
    occurredAt: new Date().toISOString(),
    correlationId: null,
    actorId: null,
    payload: {
      sourcingLineId,
      categoryId,
      itemCode: 'RT-001',
      description: 'Unmatched research test item',
      qty: '2.000',
      uom: 'NOS',
      deliveryCity: 'TestCity',
      deliveryState: 'TestState',
      needBy: null,
      ...(neededSupplierCount ? { neededSupplierCount } : {}),
    },
  };
}

describe('supplier research agent', () => {
  it('researches, persists a prospect, notifies, records the run, and re-emits sourcing_line_matched', async () => {
    const categoryId = await seedUnmatchedCategory();
    const lineId = await seedUnmatchedLine(categoryId);
    const email = `acme-${randomUUID().slice(0, 8)}@example.com`;
    const research = researchClientReturning([fakeCandidate({ email })]);
    const consumer = supplierResearchAgent({ db, research, maxCandidates: 5 });

    expect(await handleEvent(db, consumer, unmatchedEvent(lineId, categoryId))).toBe('processed');
    expect(research.calls).toBe(1);

    const [supplier] = await db.select().from(platformSuppliers).where(eq(platformSuppliers.email, email));
    expect(supplier).toBeDefined();
    expect(supplier!.status).toBe('prospect');
    expect(supplier!.gst).toBeNull();
    expect(supplier!.discoveryMetadata).toMatchObject({ placeId: 'fake-place-id', sourcingLineId: lineId });

    const [cat] = await db.select().from(supplierCategories).where(and(eq(supplierCategories.platformSupplierId, supplier!.id), eq(supplierCategories.categoryId, categoryId)));
    expect(cat).toBeDefined();

    const [run] = await db.select().from(supplierResearchRuns).where(eq(supplierResearchRuns.categoryId, categoryId));
    expect(run).toBeDefined();
    expect(run!.candidatesFound).toBe(1);

    const [job] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingResearchJobs).where(eq(sourcingResearchJobs.sourcingLineId, lineId)),
    );
    expect(job).toMatchObject({ status: 'partial', foundCount: 1, attemptCount: 1 });

    const [outboxRow] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.sourcing_line_matched'), eq(outbox.aggregateId, lineId))),
    );
    expect(outboxRow).toBeDefined();
    expect(outboxRow!.payload).toMatchObject({ invitedNewCount: 1 });
  });

  it('skips research and just re-notifies once a prospect already covers the category (cost guard against redelivery/races)', async () => {
    const categoryId = await seedUnmatchedCategory();
    for (let i = 0; i < 5; i++) {
      const email = `existing-${i}-${randomUUID().slice(0, 8)}@example.com`;
      const [existingProspect] = await db
        .insert(platformSuppliers)
        .values({ name: `Existing Prospect Co ${i}`, gst: null, email, city: 'TestCity', state: 'TestState', status: 'prospect' })
        .returning();
      await db.insert(supplierCategories).values({ platformSupplierId: existingProspect!.id, categoryId });
    }

    const lineId = await seedUnmatchedLine(categoryId);
    const research = researchClientReturning([fakeCandidate()]);
    const consumer = supplierResearchAgent({ db, research, maxCandidates: 5 });

    expect(await handleEvent(db, consumer, unmatchedEvent(lineId, categoryId))).toBe('processed');
    expect(research.calls).toBe(0);

    // No research ran, so no run is logged -- a redelivery/race short-circuit isn't a genuine zero-result
    // research run and must not falsely mark the category hopeless for the cost-guard's 24h window.
    const runs = await db.select().from(supplierResearchRuns).where(eq(supplierResearchRuns.categoryId, categoryId));
    expect(runs).toHaveLength(0);

    // This line still gets its invites -- the existing prospects are not silently dropped.
    const [outboxRow] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.sourcing_line_matched'), eq(outbox.aggregateId, lineId))),
    );
    expect(outboxRow).toBeDefined();
    expect(outboxRow!.payload).toMatchObject({ invitedNewCount: 5 });

    const [job] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingResearchJobs).where(eq(sourcingResearchJobs.sourcingLineId, lineId)),
    );
    expect(job).toMatchObject({ status: 'completed', foundCount: 5, attemptCount: 1 });
  });

  it('leaves a zero-candidate run retryable and does not emit a match', async () => {
    const categoryId = await seedUnmatchedCategory();
    const lineId = await seedUnmatchedLine(categoryId);
    const research = researchClientReturning([]);
    const consumer = supplierResearchAgent({ db, research, maxCandidates: 5 });

    expect(await handleEvent(db, consumer, unmatchedEvent(lineId, categoryId))).toBe('processed');

    const runs = await db.select().from(supplierResearchRuns).where(eq(supplierResearchRuns.categoryId, categoryId));
    expect(runs).toHaveLength(0);

    const [outboxRow] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(outbox).where(and(eq(outbox.eventType, 'sourcing.sourcing_line_matched'), eq(outbox.aggregateId, lineId))),
    );
    expect(outboxRow).toBeUndefined();

    const [job] = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(sourcingResearchJobs).where(eq(sourcingResearchJobs.sourcingLineId, lineId)),
    );
    expect(job).toMatchObject({ status: 'failed', foundCount: 0, attemptCount: 1 });
    expect(job!.lastError).toContain('No verified suppliers');
  });

  it('is idempotent per event id via the inbox (exact redelivery of the same event is skipped entirely)', async () => {
    const categoryId = await seedUnmatchedCategory();
    const lineId = await seedUnmatchedLine(categoryId);
    const research = researchClientReturning([fakeCandidate()]);
    const consumer = supplierResearchAgent({ db, research, maxCandidates: 5 });
    const event = unmatchedEvent(lineId, categoryId, 1);

    expect(await handleEvent(db, consumer, event)).toBe('processed');
    expect(await handleEvent(db, consumer, event)).toBe('duplicate');
    expect(research.calls).toBe(1);
  });
});
