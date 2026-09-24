import { subjectFor, type EventEnvelope } from '@vprocly/contracts';
import { claimOutbox, markOutboxFailed, markOutboxPublished, type Database, type OutboxRow } from '@vprocly/db';
import type { JetStreamClient } from '@nats-io/jetstream';

export function toEnvelope(row: OutboxRow): EventEnvelope {
  return {
    id: row.id,
    type: row.event_type,
    version: row.event_version,
    tenantId: row.tenant_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    correlationId: row.correlation_id,
    actorId: row.actor_id,
    payload: row.payload,
  };
}

export type RelayResult = { published: number; failed: number };

/**
 * Publishes one batch of pending outbox events. Rows stay locked (FOR UPDATE SKIP LOCKED) for the duration,
 * so several relay replicas can run safely. If the process dies after publishing but before commit, the
 * event is re-sent with the same Nats-Msg-Id and JetStream drops the duplicate.
 */
export async function relayOnce(db: Database, js: JetStreamClient, batchSize: number): Promise<RelayResult> {
  return db.transaction(async (tx) => {
    const rows = await claimOutbox(tx, batchSize);
    const published: string[] = [];
    let failed = 0;
    for (const row of rows) {
      const envelope = toEnvelope(row);
      try {
        await js.publish(subjectFor(envelope), JSON.stringify(envelope), { msgID: envelope.id });
        published.push(row.id);
      } catch (err) {
        failed++;
        await markOutboxFailed(tx, row.id, err instanceof Error ? err.message : String(err));
      }
    }
    await markOutboxPublished(tx, published);
    return { published: published.length, failed };
  });
}
