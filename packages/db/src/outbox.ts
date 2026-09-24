import { sql } from 'drizzle-orm';
import type { Tx } from './client.js';
import { outbox } from './schema/platform.js';

export type OutboxEvent = {
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId?: string | null;
  actorId?: string | null;
};

/** Records a domain event in the same transaction as the state change. Tenant comes from the RLS context. */
export async function enqueueEvent(tx: Tx, tenantId: string, e: OutboxEvent): Promise<string> {
  const [row] = await tx
    .insert(outbox)
    .values({
      tenantId,
      eventType: e.eventType,
      eventVersion: e.eventVersion,
      aggregateType: e.aggregateType,
      aggregateId: e.aggregateId,
      payload: e.payload,
      correlationId: e.correlationId ?? null,
      actorId: e.actorId ?? null,
    })
    .returning({ id: outbox.id });
  return row!.id;
}

export type OutboxRow = {
  id: string;
  tenant_id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  actor_id: string | null;
  occurred_at: Date;
  attempts: number;
};

export async function claimOutbox(tx: Tx, limit: number): Promise<OutboxRow[]> {
  const res = await tx.execute<OutboxRow>(sql`SELECT * FROM outbox_claim(${limit})`);
  return res.rows;
}

export async function markOutboxPublished(tx: Tx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Bound as a Postgres array literal; the ::uuid[] cast rejects anything that is not a uuid.
  await tx.execute(sql`SELECT outbox_mark_published(${`{${ids.join(',')}}`}::uuid[])`);
}

export async function markOutboxFailed(tx: Tx, id: string, error: string): Promise<void> {
  await tx.execute(sql`SELECT outbox_mark_failed(${id}::uuid, ${error})`);
}
