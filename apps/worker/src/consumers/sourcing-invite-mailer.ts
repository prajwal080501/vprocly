import { createInviteToken, INVITE_TOKEN_TTL_DAYS } from '@vprocly/contracts';
import { categories, sourcingLineNotifications, sourcingLines, supplierContactAttempts, withTenant, type Database } from '@vprocly/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { Mailers } from '../mailer.js';
import { buildInviteEmailContent } from './invite-email-content.js';

type PendingInvite = { id: string; email: string; platformSupplierId: string | null; tokenHash: string; token: string; expiresAt: Date };

/**
 * Sends one explicitly requested fallback invite email, generating its invite token
 * right here (not in the API) so a raw token never sits in the durable, replayable event payload -- see
 * sourcing.service.ts. Each successful recipient is marked immediately, so a later recipient hitting an
 * SMTP rate limit does not cause already-delivered invitations (or their tokens) to be regenerated.
 */
export function sourcingInviteMailer(
  deps: { db: Database; mailers: Mailers; publicWebUrl: string },
): ConsumerDefinition<void> {
  return {
    name: 'sourcing-invite-mailer',
    filterSubjects: ['vprocly.*.sourcing.supplier_email_requested.v1'],
    // After the short retries, the shared consumer backoff caps at ten minutes. Twelve deliveries keep a
    // rate-limited message alive for over an hour instead of dead-lettering it before the SMTP window resets.
    maxDeliver: 12,
    async prepare(event) {
      const sourcingLineId = String(event.payload.sourcingLineId);
      const notificationId = String(event.payload.notificationId);
      const { line, pendingRows } = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
        const [row] = await tx
          .select({
            itemCode: sourcingLines.itemCode,
            description: sourcingLines.description,
            qty: sourcingLines.qty,
            uom: sourcingLines.uom,
            categoryName: categories.name,
            deliveryCity: sourcingLines.deliveryCity,
            deliveryState: sourcingLines.deliveryState,
            needBy: sourcingLines.needBy,
          })
          .from(sourcingLines)
          .innerJoin(categories, eq(categories.id, sourcingLines.categoryId))
          .where(eq(sourcingLines.id, sourcingLineId));
        const pendingRows = await tx
          .select({ id: sourcingLineNotifications.id, email: sourcingLineNotifications.email, platformSupplierId: sourcingLineNotifications.platformSupplierId })
          .from(sourcingLineNotifications)
          .where(and(eq(sourcingLineNotifications.id, notificationId), eq(sourcingLineNotifications.sourcingLineId, sourcingLineId), isNull(sourcingLineNotifications.sentAt)));
        return { line: row, pendingRows };
      });
      if (!line) return; // line was deleted/not found; nothing to send

      const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
      const pending: PendingInvite[] = pendingRows.map((r) => ({ ...r, ...createInviteToken(), expiresAt }));

      for (const invite of pending) {
        const link = `${deps.publicWebUrl}/supplier/invite/${invite.token}`;
        const content = buildInviteEmailContent(line, link);

        // Activate the token before handing the message to SMTP. Previously this update happened only
        // after sendMail() returned, so a supplier who clicked immediately (or a worker that stopped after
        // SMTP accepted the message) received an email whose link did not exist in the database.
        await withTenant(deps.db, { tenantId: event.tenantId, correlationId: event.correlationId ?? undefined }, async (tx) => {
          await tx
            .update(sourcingLineNotifications)
            .set({ tokenHash: invite.tokenHash, expiresAt: invite.expiresAt })
            .where(and(eq(sourcingLineNotifications.id, invite.id), isNull(sourcingLineNotifications.sentAt)));
        });

        await deps.mailers.rfq.sendMail({ from: deps.mailers.rfqFrom, to: invite.email, ...content });
        await withTenant(deps.db, { tenantId: event.tenantId, correlationId: event.correlationId ?? undefined }, async (tx) => {
          await tx
            .update(sourcingLineNotifications)
            .set({ sentAt: new Date() })
            .where(and(eq(sourcingLineNotifications.id, invite.id), isNull(sourcingLineNotifications.sentAt)));
          await tx.insert(supplierContactAttempts).values({
            tenantId: event.tenantId,
            notificationId: invite.id,
            sourcingLineId,
            platformSupplierId: invite.platformSupplierId,
            channel: 'email',
            purpose: 'rfq',
            status: 'sent',
            provider: 'smtp',
            completedAt: new Date(),
            metadata: { reason: event.payload.reason },
          });
        });
      }
    },
    async handler() {},
  };
}
