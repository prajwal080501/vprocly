import { randomUUID } from 'node:crypto';
import { EVENTS_STREAM, type EventEnvelope } from '@vprocly/contracts';
import { createDatabase, createPool, enqueueEvent, inboxDedup, outbox, withTenant } from '@vprocly/db';
import { AckPolicy, DeliverPolicy, jetstream, jetstreamManager, type JetStreamClient } from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleEvent, runConsumer, type ConsumerDefinition } from '../src/consumer.js';
import { relayOnce } from '../src/relay.js';
import { DLQ_STREAM, dlqSubject, ensureStreams } from '../src/streams.js';

// Runs against the dev stack (Postgres + NATS JetStream).
const ACME = '11111111-1111-4111-8111-111111111111';
const pool = createPool(process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly');
const db = createDatabase(pool);
let nc: NatsConnection;
let js: JetStreamClient;

beforeAll(async () => {
  nc = await connect({ servers: process.env.NATS_URL ?? 'nats://localhost:54222' });
  js = jetstream(nc);
  await ensureStreams(nc);
});

afterAll(async () => {
  await nc?.drain();
  await pool.end();
});

async function enqueue(aggregateId: string) {
  return withTenant(db, { tenantId: ACME }, (tx) =>
    enqueueEvent(tx, ACME, {
      eventType: 'master_data.supplier_created',
      eventVersion: 1,
      aggregateType: 'supplier',
      aggregateId,
      payload: { supplierId: aggregateId, code: 'X', name: 'X', sourceSystem: 'test' },
    }),
  );
}

/** Reads the last message stored on a subject, via an ephemeral consumer. */
async function lastOn(stream: string, subject: string) {
  const jsm = await jetstreamManager(nc);
  const ci = await jsm.consumers.add(stream, {
    ack_policy: AckPolicy.None,
    deliver_policy: DeliverPolicy.LastPerSubject,
    filter_subject: subject,
    inactive_threshold: 5_000_000_000,
  });
  const c = await js.consumers.get(stream, ci.name);
  const m = await c.next({ expires: 2000 });
  return m?.json<Record<string, unknown>>() ?? null;
}

describe('outbox relay', () => {
  it('publishes pending events to JetStream and marks them published', async () => {
    const aggregateId = randomUUID();
    const eventId = await enqueue(aggregateId);

    let published = 0;
    for (let i = 0; i < 20 && published === 0; i++) {
      await relayOnce(db, js, 500);
      const [row] = await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(outbox).where(eq(outbox.id, eventId)));
      published = row?.publishedAt ? 1 : 0;
    }
    expect(published).toBe(1);

    const msg = await lastOn(EVENTS_STREAM, `vprocly.${ACME}.master_data.supplier_created.v1`);
    expect(msg).toMatchObject({ id: eventId, tenantId: ACME, aggregateId, type: 'master_data.supplier_created', version: 1 });
  });

  it('relies on JetStream de-duplication when an event is re-sent', async () => {
    const id = randomUUID();
    const subject = `vprocly.${ACME}.test.dedup.v1`;
    const first = await js.publish(subject, '{}', { msgID: id });
    const second = await js.publish(subject, '{}', { msgID: id });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.seq).toBe(first.seq);
  });
});

describe('consumers', () => {
  const envelope = (): EventEnvelope => ({
    id: randomUUID(),
    type: 'master_data.supplier_created',
    version: 1,
    tenantId: ACME,
    aggregateType: 'supplier',
    aggregateId: randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: null,
    actorId: null,
    payload: {},
  });

  it('processes an event once per consumer even if delivered twice', async () => {
    let calls = 0;
    const def: ConsumerDefinition = { name: 'test-idempotent', filterSubjects: [], handler: async () => void calls++ };
    const e = envelope();
    expect(await handleEvent(db, def, e)).toBe('processed');
    expect(await handleEvent(db, def, e)).toBe('duplicate');
    expect(calls).toBe(1);
  });

  it('rolls back the dedup record when the handler fails, so a retry runs it again', async () => {
    const e = envelope();
    let fail = true;
    const def: ConsumerDefinition = {
      name: 'test-retry',
      filterSubjects: [],
      handler: async () => {
        if (fail) throw new Error('transient');
      },
    };
    await expect(handleEvent(db, def, e)).rejects.toThrow('transient');
    const rows = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(inboxDedup).where(eq(inboxDedup.eventId, e.id)),
    );
    expect(rows).toHaveLength(0);
    fail = false;
    expect(await handleEvent(db, def, e)).toBe('processed');
  });

  it('dead-letters an event after the last delivery attempt', async () => {
    const name = `test-dlq-${randomUUID().slice(0, 8)}`;
    const def: ConsumerDefinition = {
      name,
      filterSubjects: [`vprocly.${ACME}.test.poison.v1`],
      maxDeliver: 1,
      handler: async () => {
        throw new Error('poison');
      },
    };
    const running = await runConsumer(nc, js, db, def);
    const e = { ...envelope(), type: 'test.poison' };
    await js.publish(`vprocly.${ACME}.test.poison.v1`, JSON.stringify(e), { msgID: e.id });

    let dead: Record<string, unknown> | null = null;
    for (let i = 0; i < 20 && !dead; i++) {
      await new Promise((r) => setTimeout(r, 250));
      dead = await lastOn(DLQ_STREAM, dlqSubject(name));
    }
    await running.stop();
    await (await jetstreamManager(nc)).consumers.delete(EVENTS_STREAM, name);

    expect(dead).toMatchObject({ consumer: name, reason: 'poison', deliveries: 1 });
    expect(JSON.parse(String(dead!.data))).toMatchObject({ id: e.id });
  });
});
