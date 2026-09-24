import { EVENTS_STREAM, EVENTS_SUBJECTS } from '@vprocly/contracts';
import { jetstreamManager, RetentionPolicy, StorageType } from '@nats-io/jetstream';
import { nanos, type NatsConnection } from '@nats-io/transport-node';

export const DLQ_STREAM = 'VPROCLY_DLQ';
export const dlqSubject = (consumer: string) => `vprocly-dlq.${consumer}`;

/** Idempotently creates the event and dead-letter streams. */
export async function ensureStreams(nc: NatsConnection): Promise<void> {
  const jsm = await jetstreamManager(nc);
  const streams = [
    {
      name: EVENTS_STREAM,
      subjects: [EVENTS_SUBJECTS],
      // Publisher de-duplication on Nats-Msg-Id (the outbox event id) covers relay retries.
      duplicate_window: nanos(2 * 60 * 1000),
      max_age: nanos(30 * 24 * 60 * 60 * 1000),
    },
    { name: DLQ_STREAM, subjects: ['vprocly-dlq.>'], duplicate_window: nanos(2 * 60 * 1000), max_age: 0 },
  ];
  for (const s of streams) {
    const config = { ...s, retention: RetentionPolicy.Limits, storage: StorageType.File };
    try {
      await jsm.streams.info(s.name);
      await jsm.streams.update(s.name, config);
    } catch {
      await jsm.streams.add(config);
    }
  }
}
