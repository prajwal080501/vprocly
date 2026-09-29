import { randomUUID } from 'node:crypto';
import { parseEventPayload } from '@vprocly/contracts';
import { enqueueEvent, platformSuppliers, sourcingLineNotifications, sourcingLines, supplierVoiceCalls, withTenant, type Database } from '@vprocly/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { CampaignClient } from '../voice/sarvam-campaign-client.js';
import { supplierCallItemDescription } from '../voice/sarvam-client.js';

type Outcome =
  | { kind: 'manual_invite'; notificationId: string }
  | { kind: 'no_phone'; notificationId: string }
  | { kind: 'capture_skip'; notificationId: string; platformSupplierId: string | null; phone: string }
  | { kind: 'cohort_added'; notificationId: string; platformSupplierId: string | null; phone: string; voiceCallId: string };

type Prepared = { outcomes: Outcome[] };

/**
 * Routes every newly matched supplier through voice first when a number is available. Suppliers to be
 * called are streamed into one long-lived Sarvam campaign (see sarvam-campaign-client.ts) rather than
 * called one-by-one via Instant Outbound -- Sarvam's own scheduler places the actual call, respecting the
 * campaign's business-hours/rate/retry config, and the completion webhook (voice-outreach.service.ts)
 * updates the row and falls back to email on failure. Creates one durable voice row per notification, so
 * event redelivery cannot schedule the same supplier twice.
 */
export function supplierOutreachRouter(
  deps: { db: Database; voiceMode: 'capture' | 'live'; campaign?: CampaignClient; campaignId?: string },
): ConsumerDefinition<Prepared> {
  const canCall = deps.voiceMode === 'live' && deps.campaign && deps.campaignId;
  // Accurate even when voiceMode is 'live' but campaign setup failed at startup (main.ts) -- "capture mode"
  // would be a misleading reason to log in that case.
  const skipReason = deps.voiceMode !== 'live' ? 'Voice delivery is in capture mode.' : 'Sarvam campaign is not available (setup failed or Sarvam is unconfigured).';

  return {
    name: 'supplier-outreach-router',
    filterSubjects: ['vprocly.*.sourcing.sourcing_line_matched.v1'],
    async prepare(event) {
      const sourcingLineId = String(event.payload.sourcingLineId);
      const { line, pending } = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
        const [line] = await tx
          .select({ description: sourcingLines.description, qty: sourcingLines.qty, uom: sourcingLines.uom, deliveryCity: sourcingLines.deliveryCity, deliveryState: sourcingLines.deliveryState })
          .from(sourcingLines)
          .where(eq(sourcingLines.id, sourcingLineId));
        const pending = await tx
          .select({
            notificationId: sourcingLineNotifications.id,
            platformSupplierId: sourcingLineNotifications.platformSupplierId,
            phone: platformSuppliers.phone,
            supplierName: platformSuppliers.name,
            voiceCallId: supplierVoiceCalls.id,
          })
          .from(sourcingLineNotifications)
          .leftJoin(platformSuppliers, eq(platformSuppliers.id, sourcingLineNotifications.platformSupplierId))
          .leftJoin(supplierVoiceCalls, eq(supplierVoiceCalls.notificationId, sourcingLineNotifications.id))
          .where(and(eq(sourcingLineNotifications.sourcingLineId, sourcingLineId), isNull(sourcingLineNotifications.sentAt)));
        return { line, pending };
      });
      if (!line) return { outcomes: [] }; // line was deleted; nothing to do

      const outcomes: Outcome[] = [];
      const cohortMembers: { userPhoneNumber: string; userIdentifier: string; appVariables: Record<string, string> }[] = [];

      for (const supplier of pending) {
        if (supplier.voiceCallId) continue; // already routed (any status) -- redelivery guard
        // Notifications without a platform supplier are email addresses explicitly entered by the buyer.
        // They bypass automatic call/email delivery policy and use the live manual mailer.
        if (!supplier.platformSupplierId) {
          outcomes.push({ kind: 'manual_invite', notificationId: supplier.notificationId });
          continue;
        }
        const phone = supplier.phone?.trim();
        if (!phone) {
          outcomes.push({ kind: 'no_phone', notificationId: supplier.notificationId });
          continue;
        }
        if (!canCall) {
          outcomes.push({ kind: 'capture_skip', notificationId: supplier.notificationId, platformSupplierId: supplier.platformSupplierId, phone });
          continue;
        }

        // Generated here (not by the DB) so it can double as (part of) Sarvam's `user_identifier` -- the
        // completion webhook echoes it back, letting voice-outreach.service.ts find this row again.
        // Accepted risk: if this event is redelivered after prepare() ran but before handler() committed
        // (e.g. a crash), a fresh id is generated and the supplier is streamed into the cohort again -- the
        // same redelivery/double-spend risk already accepted for supplier-research-agent.ts's AI calls.
        const voiceCallId = randomUUID();
        cohortMembers.push({
          userPhoneNumber: phone,
          // Campaign webhooks carry no per-call tenant metadata the way Instant Outbound's request-level
          // metadata does, but supplier_voice_calls is RLS-scoped by tenant -- so the tenant id has to travel
          // inside user_identifier itself, or the webhook handler has no tenant to query with. See
          // voice-outreach.service.ts's matching parse of this exact format.
          userIdentifier: `${event.tenantId}:${voiceCallId}`,
          appVariables: {
            supplier_name: supplier.supplierName ?? '',
            item_description: supplierCallItemDescription(
              line.description,
              line.qty,
              line.uom,
              line.deliveryCity,
              line.deliveryState,
            ),
          },
        });
        outcomes.push({ kind: 'cohort_added', notificationId: supplier.notificationId, platformSupplierId: supplier.platformSupplierId, phone, voiceCallId });
      }

      if (canCall && cohortMembers.length > 0) await deps.campaign!.addToCohort(deps.campaignId!, cohortMembers);
      return { outcomes };
    },
    async handler(tx, event, { outcomes }) {
      const sourcingLineId = String(event.payload.sourcingLineId);

      const emailFallback = async (notificationId: string, reason: 'no_phone' | 'voice_disabled') => {
        const payload = parseEventPayload('sourcing.supplier_email_requested', 1, { notificationId, sourcingLineId, reason });
        await enqueueEvent(tx, event.tenantId, {
          eventType: 'sourcing.supplier_email_requested',
          eventVersion: 1,
          aggregateType: 'sourcing_line_notification',
          aggregateId: notificationId,
          payload,
          correlationId: event.correlationId,
          actorId: event.actorId,
        });
      };

      for (const outcome of outcomes) {
        if (outcome.kind === 'manual_invite') {
          const payload = parseEventPayload('sourcing.supplier_manual_email_requested', 1, {
            notificationId: outcome.notificationId,
            sourcingLineId,
          });
          await enqueueEvent(tx, event.tenantId, {
            eventType: 'sourcing.supplier_manual_email_requested',
            eventVersion: 1,
            aggregateType: 'sourcing_line_notification',
            aggregateId: outcome.notificationId,
            payload,
            correlationId: event.correlationId,
            actorId: event.actorId,
          });
          continue;
        }
        if (outcome.kind === 'no_phone') {
          await emailFallback(outcome.notificationId, 'no_phone');
          continue;
        }
        if (outcome.kind === 'capture_skip') {
          const [voiceCall] = await tx
            .insert(supplierVoiceCalls)
            .values({
              tenantId: event.tenantId,
              notificationId: outcome.notificationId,
              sourcingLineId,
              platformSupplierId: outcome.platformSupplierId,
              phone: outcome.phone,
              status: 'skipped',
              failureReason: skipReason,
              completedAt: new Date(),
            })
            .onConflictDoNothing()
            .returning({ id: supplierVoiceCalls.id });
          if (!voiceCall) continue;
          await emailFallback(outcome.notificationId, 'voice_disabled');
          continue;
        }
        // cohort_added -- already streamed into the campaign in prepare(); just record the row. Sarvam's
        // completion webhook (voice-outreach.service.ts) updates status and falls back to email on failure.
        await tx
          .insert(supplierVoiceCalls)
          .values({
            id: outcome.voiceCallId,
            tenantId: event.tenantId,
            notificationId: outcome.notificationId,
            sourcingLineId,
            platformSupplierId: outcome.platformSupplierId,
            phone: outcome.phone,
            status: 'queued',
          })
          .onConflictDoNothing();
      }
    },
  };
}
