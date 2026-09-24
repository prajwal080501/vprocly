import { z } from 'zod';

/**
 * Wire format for every domain event published from the outbox. Consumers must be idempotent on `id`:
 * delivery is at-least-once.
 */
export const EventEnvelope = z.object({
  id: z.uuid(),
  type: z.string(),
  version: z.number().int().positive(),
  tenantId: z.uuid(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  occurredAt: z.iso.datetime(),
  correlationId: z.uuid().nullable(),
  actorId: z.uuid().nullable(),
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

/** NATS subject for an event: vprocly.<tenant>.<type>.v<version>, so consumers can filter by tenant or type. */
export function subjectFor(e: Pick<EventEnvelope, 'tenantId' | 'type' | 'version'>): string {
  return `vprocly.${e.tenantId}.${e.type}.v${e.version}`;
}

export const EVENTS_STREAM = 'VPROCLY_EVENTS';
export const EVENTS_SUBJECTS = 'vprocly.>';
