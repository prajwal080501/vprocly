import { Injectable } from '@nestjs/common';
import { parseEventPayload } from '@vprocly/contracts';
import { enqueueEvent, type Tx } from '@vprocly/db';
import type { RequestContext } from './request-context.js';

export type DomainEvent = {
  type: string;
  version: number;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
};

/** Writes domain events to the transactional outbox. Payloads are validated against @vprocly/contracts. */
@Injectable()
export class EventsService {
  async emit(tx: Tx, ctx: RequestContext, e: DomainEvent): Promise<string> {
    const payload = parseEventPayload(e.type, e.version, e.payload);
    return enqueueEvent(tx, ctx.tenantId, {
      eventType: e.type,
      eventVersion: e.version,
      aggregateType: e.aggregateType,
      aggregateId: e.aggregateId,
      payload,
      correlationId: ctx.correlationId,
      actorId: ctx.userId,
    });
  }
}
