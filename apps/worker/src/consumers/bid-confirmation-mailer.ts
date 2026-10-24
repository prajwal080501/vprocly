import { BID_CONFIRMATION_TOKEN_TTL_DAYS, createInviteToken } from '@vprocly/contracts';
import { bidDrafts, sourcingLineNotifications, sourcingLines, supplierContactAttempts, withTenant, type Database } from '@vprocly/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import { renderDetailsTable, renderEmailHtml } from '../email-template.js';
import type { Mailers } from '../mailer.js';

export function bidConfirmationMailer(deps: { db: Database; mailers: Mailers; publicWebUrl: string }): ConsumerDefinition<void> {
  return {
    name: 'bid-confirmation-mailer',
    filterSubjects: ['vprocly.*.sourcing.bid_draft_confirmation_requested.v1'],
    maxDeliver: 12,
    async prepare(event) {
      const bidDraftId = String(event.payload.bidDraftId);
      const row = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
        const [result] = await tx
          .select({
            notificationId: bidDrafts.notificationId,
            platformSupplierId: bidDrafts.platformSupplierId,
            email: sourcingLineNotifications.email,
            description: sourcingLines.description,
            qty: sourcingLines.qty,
            uom: sourcingLines.uom,
            unitPrice: bidDrafts.unitPrice,
            minimumOrderQty: bidDrafts.minimumOrderQty,
            leadTimeDays: bidDrafts.leadTimeDays,
          })
          .from(bidDrafts)
          .innerJoin(sourcingLineNotifications, eq(sourcingLineNotifications.id, bidDrafts.notificationId))
          .innerJoin(sourcingLines, eq(sourcingLines.id, bidDrafts.sourcingLineId))
          .where(and(eq(bidDrafts.id, bidDraftId), isNull(bidDrafts.confirmationTokenHash)));
        return result;
      });
      if (!row) return;

      const token = createInviteToken();
      const expiresAt = new Date(Date.now() + BID_CONFIRMATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
      const link = `${deps.publicWebUrl}/supplier/bid-confirmation/${token.token}`;
      const details: Array<[string, string]> = [
        ['Item', row.description],
        ['Quantity', `${row.qty} ${row.uom}`],
        ['Captured price', row.unitPrice ?? 'Please provide'],
        ['MOQ', row.minimumOrderQty ?? 'Not specified'],
        ['Lead time', row.leadTimeDays ? `${row.leadTimeDays} days` : 'Please provide'],
      ];
      await deps.mailers.rfq.sendMail({
        from: deps.mailers.rfqFrom,
        to: row.email,
        subject: `Confirm your quote for ${row.description}`,
        text: `We captured a quote during your call. Review and confirm it here: ${link}\n\nThis link expires in ${BID_CONFIRMATION_TOKEN_TTL_DAYS} days.`,
        html: renderEmailHtml({
          preheader: `Review the quote captured during your supplier call`,
          heading: 'Confirm your quote',
          bodyHtml: `<p style="margin:0 0 4px;">We captured the following details during your call. Review or complete them before submitting.</p>${renderDetailsTable(details)}`,
          cta: { label: 'Review and confirm quote', url: link },
          footerNote: `This link expires in ${BID_CONFIRMATION_TOKEN_TTL_DAYS} days.`,
        }),
      });
      await withTenant(deps.db, { tenantId: event.tenantId, correlationId: event.correlationId ?? undefined }, async (tx) => {
        const [updated] = await tx
          .update(bidDrafts)
          .set({ confirmationTokenHash: token.tokenHash, confirmationExpiresAt: expiresAt, updatedAt: new Date() })
          .where(and(eq(bidDrafts.id, bidDraftId), isNull(bidDrafts.confirmationTokenHash)))
          .returning({ id: bidDrafts.id });
        if (!updated) return;
        await tx.insert(supplierContactAttempts).values({
          tenantId: event.tenantId,
          notificationId: row.notificationId,
          sourcingLineId: String(event.payload.sourcingLineId),
          platformSupplierId: row.platformSupplierId,
          channel: 'email',
          purpose: 'bid_confirmation',
          status: 'sent',
          provider: 'smtp',
          completedAt: new Date(),
          metadata: { bidDraftId, email: row.email },
        });
      });
    },
    async handler() {},
  };
}
