import { timingSafeEqual } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { parseEventPayload } from '@vprocly/contracts';
import { enqueueEvent, supplierVoiceCalls, withTenant, type Database } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DATABASE } from '../../platform/database.module.js';

const SarvamWebhook = z.object({
  attempt_id: z.string().min(1),
  status: z.enum(['connected', 'no_answer', 'busy', 'failed']),
  duration: z.number().nonnegative().nullable().optional(),
  interaction_id: z.string().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
  final_agent_variables: z.record(z.string(), z.unknown()).nullable().optional(),
  output_agent_variables: z.record(z.string(), z.unknown()).nullable().optional(),
  interaction_transcript: z.array(z.object({
    role: z.enum(['agent', 'user']),
    en_text: z.string(),
  })).nullable().optional(),
  // Instant Outbound (the Phase E manual "Call" button): per-request metadata set in sarvam-client.ts.
  webhook_config: z.object({
    metadata: z.object({
      tenant_id: z.uuid(),
      voice_call_id: z.uuid(),
    }).passthrough(),
  }).nullable().optional(),
  // Batch outbound (the automatic path, see supplier-outreach-router.ts): campaigns carry no per-call
  // metadata, so the tenant id + voice call id travel together in `user_identifier` instead, encoded as
  // `${tenantId}:${voiceCallId}`. Exact field name/nesting for a live campaign webhook isn't fully confirmed
  // from Sarvam's docs -- verify against a real delivery and adjust if it differs.
  user_identifier: z.string().nullable().optional(),
});

type CallIdentity = { tenantId: string; voiceCallId: string };

function extractCallIdentity(payload: z.infer<typeof SarvamWebhook>): CallIdentity | null {
  const metadata = payload.webhook_config?.metadata;
  if (metadata) return { tenantId: metadata.tenant_id, voiceCallId: metadata.voice_call_id };
  const [tenantId, voiceCallId] = (payload.user_identifier ?? '').split(':');
  if (tenantId && voiceCallId) return { tenantId, voiceCallId };
  return null;
}

@Injectable()
export class VoiceOutreachService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async handleSarvamWebhook(secret: string, input: unknown) {
    this.assertSecret(secret);
    const parsed = SarvamWebhook.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid Sarvam webhook payload');
    const payload = parsed.data;
    const identity = extractCallIdentity(payload);
    if (!identity) throw new NotFoundException('Voice call metadata is missing');

    return withTenant(this.db, { tenantId: identity.tenantId }, async (tx) => {
      const [call] = await tx.select().from(supplierVoiceCalls).where(eq(supplierVoiceCalls.id, identity.voiceCallId));
      if (!call) throw new NotFoundException('Voice call not found');
      if (call.attemptId && call.attemptId !== payload.attempt_id) throw new NotFoundException('Voice call attempt not found');
      const duplicate = ['connected', 'no_answer', 'busy', 'failed'].includes(call.status);
      const agentVariables = {
        ...(call.finalAgentVariables ?? {}),
        ...(payload.final_agent_variables ?? {}),
        ...(payload.output_agent_variables ?? {}),
      };

      await tx
        .update(supplierVoiceCalls)
        .set({
          status: payload.status,
          attemptId: payload.attempt_id,
          interactionId: payload.interaction_id ?? null,
          durationSeconds: payload.duration == null ? null : String(payload.duration),
          failureReason: payload.failure_reason ?? null,
          finalAgentVariables: Object.keys(agentVariables).length ? agentVariables : null,
          interactionTranscript: payload.interaction_transcript?.map((turn) => ({ role: turn.role, enText: turn.en_text })) ?? call.interactionTranscript,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supplierVoiceCalls.id, call.id));

      if (!duplicate && payload.status !== 'connected') {
        const reason = payload.status === 'failed' ? 'call_failed' : payload.status;
        const eventPayload = parseEventPayload('sourcing.supplier_email_requested', 1, {
          notificationId: call.notificationId,
          sourcingLineId: call.sourcingLineId,
          reason,
        });
        await enqueueEvent(tx, identity.tenantId, {
          eventType: 'sourcing.supplier_email_requested',
          eventVersion: 1,
          aggregateType: 'sourcing_line_notification',
          aggregateId: call.notificationId,
          payload: eventPayload,
        });
      }
      return { accepted: true, duplicate };
    });
  }

  private assertSecret(secret: string) {
    const expected = this.config.SARVAM_WEBHOOK_SECRET;
    if (!expected) throw new ServiceUnavailableException('Sarvam webhook is not configured');
    const actualBuffer = Buffer.from(secret);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }
}
