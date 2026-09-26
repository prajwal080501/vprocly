import { createInviteToken, INVITE_TOKEN_TTL_DAYS } from '@vprocly/contracts';
import { categories, sourcingLineNotifications, sourcingLines, withTenant, type Database } from '@vprocly/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { Mailers } from '../mailer.js';

type PendingInvite = { id: string; email: string; tokenHash: string; token: string; expiresAt: Date };

type LineInfo = {
  description: string;
  qty: string;
  uom: string;
  categoryName: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string | null;
};

/**
 * Sends the invite email for each supplier matched/invited on a sourcing line, generating each invite token
 * right here (not in the API) so a raw token never sits in the durable, replayable event payload -- see
 * sourcing.service.ts. If any recipient's send fails, the whole event is retried (redelivery is
 * at-least-once): a rare duplicate courtesy email to an already-notified supplier is an acceptable cost
 * against a supplier silently never being notified. A per-recipient reconciliation sweep is a fast-follow.
 */
export function sourcingInviteMailer(
  deps: { db: Database; mailers: Mailers; publicWebUrl: string },
): ConsumerDefinition<{ pending: PendingInvite[] }> {
  return {
    name: 'sourcing-invite-mailer',
    filterSubjects: ['vprocly.*.sourcing.sourcing_line_matched.v1'],
    async prepare(event) {
      const sourcingLineId = String(event.payload.sourcingLineId);
      const { line, pendingRows } = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
        const [row] = await tx
          .select({
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
          .select({ id: sourcingLineNotifications.id, email: sourcingLineNotifications.email })
          .from(sourcingLineNotifications)
          .where(and(eq(sourcingLineNotifications.sourcingLineId, sourcingLineId), isNull(sourcingLineNotifications.sentAt)));
        return { line: row, pendingRows };
      });
      if (!line) return { pending: [] }; // line was deleted/not found; nothing to send

      const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
      const pending: PendingInvite[] = pendingRows.map((r) => ({ ...r, ...createInviteToken(), expiresAt }));

      for (const invite of pending) {
        const link = `${deps.publicWebUrl}/supplier/invite/${invite.token}`;
        await deps.mailers.rfq.sendMail({
          from: deps.mailers.rfqFrom,
          to: invite.email,
          subject: `New sourcing opportunity: ${line.description}`,
          text: [
            `You have been matched to a sourcing opportunity on vProcly.`,
            ``,
            `Item: ${line.description}`,
            `Category: ${line.categoryName}`,
            `Quantity: ${line.qty} ${line.uom}`,
            `Delivery to: ${line.deliveryCity}, ${line.deliveryState}`,
            line.needBy ? `Needed by: ${line.needBy}` : undefined,
            ``,
            `View and get started: ${link}`,
            `This link expires in ${INVITE_TOKEN_TTL_DAYS} days.`,
          ]
            .filter((l): l is string => l !== undefined)
            .join('\n'),
        });
      }
      return { pending };
    },
    async handler(tx, event, { pending }) {
      for (const invite of pending) {
        await tx
          .update(sourcingLineNotifications)
          .set({ tokenHash: invite.tokenHash, expiresAt: invite.expiresAt, sentAt: new Date() })
          .where(eq(sourcingLineNotifications.id, invite.id));
      }
    },
  };
}
