import { parseEventPayload } from '@vprocly/contracts';
import {
  enqueueEvent,
  platformSuppliers,
  sourcingLineNotifications,
  sourcingLines,
  supplierContactAttempts,
  supplierVoiceCalls,
  tenants,
  withTenant,
  type Database,
} from '@vprocly/db';
import { eq } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { VoiceCallClient } from '../voice/sarvam-client.js';

type Prepared =
  | { result: 'noop' }
  | { result: 'started'; attemptId: string }
  | { result: 'failed'; reason: string };

export function supplierVoiceCaller(deps: { db: Database; voice: VoiceCallClient }): ConsumerDefinition<Prepared> {
  return {
    name: 'supplier-voice-caller',
    filterSubjects: ['vprocly.*.sourcing.supplier_call_requested.v1'],
    maxDeliver: 3,
    async prepare(event) {
      const voiceCallId = String(event.payload.voiceCallId);
      const row = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
        const [result] = await tx
          .select({
            call: supplierVoiceCalls,
            buyerCompanyName: tenants.name,
            supplierName: platformSuppliers.name,
            description: sourcingLines.description,
            qty: sourcingLines.qty,
            uom: sourcingLines.uom,
            deliveryCity: sourcingLines.deliveryCity,
            deliveryState: sourcingLines.deliveryState,
          })
          .from(supplierVoiceCalls)
          .innerJoin(sourcingLineNotifications, eq(sourcingLineNotifications.id, supplierVoiceCalls.notificationId))
          .innerJoin(platformSuppliers, eq(platformSuppliers.id, sourcingLineNotifications.platformSupplierId))
          .innerJoin(sourcingLines, eq(sourcingLines.id, supplierVoiceCalls.sourcingLineId))
          .innerJoin(tenants, eq(tenants.id, sourcingLines.tenantId))
          .where(eq(supplierVoiceCalls.id, voiceCallId));
        if (result?.call.status === 'queued') {
          await tx.update(supplierVoiceCalls).set({ status: 'dialing', startedAt: new Date(), updatedAt: new Date() }).where(eq(supplierVoiceCalls.id, voiceCallId));
        }
        return result;
      });
      if (!row || row.call.status !== 'queued') return { result: 'noop' };

      try {
        const { attemptId } = await deps.voice.createCall({
          phone: row.call.phone,
          tenantId: event.tenantId,
          voiceCallId,
          buyerCompanyName: row.buyerCompanyName,
          supplierName: row.supplierName,
          itemDescription: row.description,
          quantity: row.qty,
          uom: row.uom,
          deliveryCity: row.deliveryCity,
          deliveryState: row.deliveryState,
        });
        return { result: 'started', attemptId };
      } catch (error) {
        return { result: 'failed', reason: error instanceof Error ? error.message : String(error) };
      }
    },
    async handler(tx, event, prepared) {
      if (prepared.result === 'noop') return;
      const voiceCallId = String(event.payload.voiceCallId);
      const contactAttemptId = typeof event.payload.contactAttemptId === 'string' ? event.payload.contactAttemptId : null;
      if (prepared.result === 'started') {
        await tx.update(supplierVoiceCalls).set({ attemptId: prepared.attemptId, updatedAt: new Date() }).where(eq(supplierVoiceCalls.id, voiceCallId));
        if (contactAttemptId) {
          await tx.update(supplierContactAttempts).set({ status: 'dialing', providerAttemptId: prepared.attemptId, startedAt: new Date(), updatedAt: new Date() }).where(eq(supplierContactAttempts.id, contactAttemptId));
        }
        return;
      }

      await tx
        .update(supplierVoiceCalls)
        .set({ status: 'failed', failureReason: prepared.reason.slice(0, 2000), completedAt: new Date(), updatedAt: new Date() })
        .where(eq(supplierVoiceCalls.id, voiceCallId));
      if (contactAttemptId) {
        await tx.update(supplierContactAttempts).set({ status: 'failed', metadata: { reason: prepared.reason.slice(0, 2000) }, completedAt: new Date(), updatedAt: new Date() }).where(eq(supplierContactAttempts.id, contactAttemptId));
      }
      const payload = parseEventPayload('sourcing.supplier_email_requested', 1, {
        notificationId: String(event.payload.notificationId),
        sourcingLineId: String(event.payload.sourcingLineId),
        reason: 'call_failed',
      });
      await enqueueEvent(tx, event.tenantId, {
        eventType: 'sourcing.supplier_email_requested',
        eventVersion: 1,
        aggregateType: 'sourcing_line_notification',
        aggregateId: String(event.payload.notificationId),
        payload,
        correlationId: event.correlationId,
        actorId: event.actorId,
      });
    },
  };
}
