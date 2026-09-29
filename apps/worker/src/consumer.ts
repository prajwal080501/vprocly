import { EVENTS_STREAM, EventEnvelope } from '@vprocly/contracts';
import { inboxDedup, withTenant, type Database, type Tx } from '@vprocly/db';
import { AckPolicy, DeliverPolicy, jetstreamManager, type JetStreamClient, type JsMsg } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/transport-node';
import { dlqSubject } from './streams.js';

export type ConsumerDefinition<P = void> = {
  /** Durable consumer name; also the idempotency key namespace. */
  name: string;
  /** e.g. 'vprocly.*.master_data.supplier_created.v1' */
  filterSubjects: string[];
  maxDeliver?: number;
  /**
   * Slow or external work (object storage, virus scan, HTTP) done before the transaction so no DB
   * transaction is held open while it runs. May run again on redelivery, so it must be idempotent.
   */
  prepare?: (event: EventEnvelope) => Promise<P>;
  /** Database effects; commits atomically with the idempotency record. */
  handler: (tx: Tx, event: EventEnvelope, prepared: P) => Promise<void>;
  /** Records operational failure state outside the rolled-back handler transaction. */
  onError?: (event: EventEnvelope, error: unknown) => Promise<void>;
  /** Cleanup after commit (also on duplicate delivery), e.g. deleting a temporary object. Must be idempotent. */
  afterCommit?: (event: EventEnvelope, prepared: P) => Promise<void>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConsumer = ConsumerDefinition<any>;

export type HandleOutcome = 'processed' | 'duplicate';

/**
 * Runs the handler once per (consumer, event id): the dedup row and the handler's writes commit together
 * in the event's tenant transaction, so redelivery after a crash is a no-op.
 */
export async function handleEvent<P>(db: Database, def: ConsumerDefinition<P>, event: EventEnvelope): Promise<HandleOutcome> {
  const prepared = (def.prepare ? await def.prepare(event) : undefined) as P;
  const outcome = await withTenant(
    db,
    { tenantId: event.tenantId, correlationId: event.correlationId ?? undefined },
    async (tx): Promise<HandleOutcome> => {
      const inserted = await tx
        .insert(inboxDedup)
        .values({ tenantId: event.tenantId, consumer: def.name, eventId: event.id })
        .onConflictDoNothing()
        .returning({ eventId: inboxDedup.eventId });
      if (inserted.length === 0) return 'duplicate';
      await def.handler(tx, event, prepared);
      return 'processed';
    },
  );
  await def.afterCommit?.(event, prepared);
  return outcome;
}

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 600_000];

export async function ensureConsumer(nc: NatsConnection, def: AnyConsumer): Promise<void> {
  const jsm = await jetstreamManager(nc);
  const config = {
    durable_name: def.name,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subjects: def.filterSubjects,
    max_deliver: def.maxDeliver ?? RETRY_DELAYS_MS.length + 1,
    ack_wait: 60_000_000_000,
  };
  try {
    await jsm.consumers.info(EVENTS_STREAM, def.name);
    await jsm.consumers.update(EVENTS_STREAM, def.name, config);
  } catch {
    await jsm.consumers.add(EVENTS_STREAM, config);
  }
}

/** Consumes until the returned stop() is called. Failed events back off, then go to the DLQ. */
export async function runConsumer(nc: NatsConnection, js: JetStreamClient, db: Database, def: AnyConsumer) {
  await ensureConsumer(nc, def);
  const consumer = await js.consumers.get(EVENTS_STREAM, def.name);
  const messages = await consumer.consume();
  const maxDeliver = def.maxDeliver ?? RETRY_DELAYS_MS.length + 1;

  const loop = (async () => {
    for await (const msg of messages) {
      await processMessage(js, db, def, msg, maxDeliver);
    }
  })();

  return {
    stop: async () => {
      await messages.close();
      await loop;
    },
  };
}

async function processMessage(js: JetStreamClient, db: Database, def: AnyConsumer, msg: JsMsg, maxDeliver: number) {
  const parsed = EventEnvelope.safeParse(msg.json());
  if (!parsed.success) {
    await deadLetter(js, def, msg, `invalid envelope: ${parsed.error.message}`);
    return;
  }
  try {
    await handleEvent(db, def, parsed.data);
    msg.ack();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const attempt = msg.info.deliveryCount;
    try {
      await def.onError?.(parsed.data, err);
    } catch (hookError) {
      console.error(JSON.stringify({ msg: 'consumer error hook failed', consumer: def.name, eventId: parsed.data.id, error: String(hookError) }));
    }
    console.error(
      JSON.stringify({
        msg: 'consumer failed',
        consumer: def.name,
        eventId: parsed.data.id,
        eventType: parsed.data.type,
        attempt,
        maxDeliver,
        error: reason,
      }),
    );
    if (attempt >= maxDeliver) {
      await deadLetter(js, def, msg, reason);
    } else {
      msg.nak(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
    }
  }
}

async function deadLetter(js: JetStreamClient, def: AnyConsumer, msg: JsMsg, reason: string) {
  await js.publish(
    dlqSubject(def.name),
    JSON.stringify({ consumer: def.name, reason, subject: msg.subject, deliveries: msg.info.deliveryCount, data: msg.string() }),
    { msgID: `${def.name}:${msg.info.streamSequence}` },
  );
  msg.term(reason);
}
