import { createInviteToken, INVITE_TOKEN_TTL_DAYS } from '@vprocly/contracts';
import { categories, sourcingLineNotifications, sourcingLines, supplierContactAttempts, withTenant, type Database } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { Mailers } from '../mailer.js';
import { buildInviteEmailContent } from './invite-email-content.js';

type Prepared = { email: string; platformSupplierId: string | null } | undefined;

/**
 * The "Email now" button on a supplier row (sourcing.service.ts's manualEmail) -- always sends for real via
 * the live SMTP provider, regardless of EMAIL_DELIVERY_MODE, and regardless of whether this notification
 * already shows sentAt from an earlier capture-mode auto-send. Unlike sourcing-invite-mailer.ts, this is
 * never gated by `isNull(sentAt)`: it's an explicit "send it again, for real" action, not a fallback.
 */
export function sourcingManualMailer(deps: { db: Database; mailers: Mailers; publicWebUrl: string }): ConsumerDefinition<Prepared> {
  return {
    name: 'sourcing-manual-mailer',
    filterSubjects: ['vprocly.*.sourcing.supplier_manual_email_requested.v1'],
    maxDeliver: 5,
    async prepare(event) {
      if (!deps.mailers.liveRfq) throw new Error('Live email is not configured (SMTP_USER/SMTP_PASS missing) -- cannot send a manual invite.');

      const sourcingLineId = String(event.payload.sourcingLineId);
      const notificationId = String(event.payload.notificationId);
      const { line, notification } = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
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
        const [notification] = await tx.select({ email: sourcingLineNotifications.email, platformSupplierId: sourcingLineNotifications.platformSupplierId }).from(sourcingLineNotifications).where(eq(sourcingLineNotifications.id, notificationId));
        return { line: row, notification };
      });
      if (!line || !notification) return undefined; // line or notification was deleted; nothing to send

      const invite = { ...createInviteToken(), expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) };
      const link = `${deps.publicWebUrl}/supplier/invite/${invite.token}`;
      const content = buildInviteEmailContent(line, link);

      // Make the link resolvable before SMTP can deliver it. Keeping this write after sendMail() created a
      // race for fast clicks and left permanently invalid emails if the worker stopped between delivery and
      // the handler transaction.
      await withTenant(deps.db, { tenantId: event.tenantId, correlationId: event.correlationId ?? undefined }, async (tx) => {
        await tx
          .update(sourcingLineNotifications)
          .set({ tokenHash: invite.tokenHash, expiresAt: invite.expiresAt })
          .where(eq(sourcingLineNotifications.id, notificationId));
      });

      await deps.mailers.liveRfq.sendMail({ from: deps.mailers.liveRfqFrom, to: notification.email, ...content });
      return { email: notification.email, platformSupplierId: notification.platformSupplierId };
    },
    async handler(tx, event, prepared) {
      if (!prepared) return;
      const notificationId = String(event.payload.notificationId);
      await tx
        .update(sourcingLineNotifications)
        .set({ sentAt: new Date() })
        .where(eq(sourcingLineNotifications.id, notificationId));
      await tx.insert(supplierContactAttempts).values({
        tenantId: event.tenantId,
        notificationId,
        sourcingLineId: String(event.payload.sourcingLineId),
        platformSupplierId: prepared.platformSupplierId,
        channel: 'email',
        purpose: 'rfq',
        status: 'sent',
        provider: 'smtp',
        completedAt: new Date(),
        metadata: { manual: true },
      });
    },
  };
}
