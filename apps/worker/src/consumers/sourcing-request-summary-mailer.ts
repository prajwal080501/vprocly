import { users, withTenant, type Database } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { Mailers } from '../mailer.js';
import { renderEmailHtml } from '../email-template.js';

/**
 * Lets the buyer see what went out without ever putting them on the same email a supplier receives: CC'ing
 * the buyer's real address on a supplier-facing invite would leak the buyer's identity through the CC
 * header alone, defeating the blind-bid rule regardless of what the email body says. This is a separate,
 * buyer-only email instead, sent from the noreply identity (never the rfq one suppliers see).
 */
export function sourcingRequestSummaryMailer(deps: { db: Database; mailers: Mailers; publicWebUrl: string }): ConsumerDefinition {
  return {
    name: 'sourcing-request-summary-mailer',
    filterSubjects: ['vprocly.*.sourcing.sourcing_request_matched.v1'],
    async prepare(event) {
      if (!event.actorId) return; // no buyer to notify (e.g. a future system-initiated request)
      const buyer = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
        const [row] = await tx.select({ email: users.email, name: users.displayName }).from(users).where(eq(users.id, event.actorId!));
        return row;
      });
      if (!buyer?.email) return;

      const p = event.payload as { sourcingRequestId: string; title: string; lineCount: number; matchedSupplierCount: number; invitedNewCount: number };
      const link = `${deps.publicWebUrl}/sourcing/${p.sourcingRequestId}`;
      await deps.mailers.noreply.sendMail({
        from: deps.mailers.noreplyFrom,
        to: buyer.email,
        subject: `Sourcing request sent: ${p.title}`,
        text: [
          buyer.name ? `Hi ${buyer.name},` : 'Hi,',
          ``,
          `Your sourcing request "${p.title}" (${p.lineCount} item${p.lineCount === 1 ? '' : 's'}) went out to suppliers.`,
          `${p.matchedSupplierCount} already-registered supplier${p.matchedSupplierCount === 1 ? ' was' : 's were'} matched and notified, and ${p.invitedNewCount} new supplier${p.invitedNewCount === 1 ? ' was' : 's were'} invited.`,
          ``,
          `View it: ${link}`,
        ].join('\n'),
        html: renderEmailHtml({
          preheader: `Your sourcing request "${p.title}" went out to suppliers.`,
          heading: 'Sourcing request sent',
          bodyHtml: [
            `<p style="margin:0 0 12px;">${buyer.name ? `Hi ${buyer.name},` : 'Hi,'}</p>`,
            `<p style="margin:0 0 12px;">Your sourcing request <strong>"${p.title}"</strong> (${p.lineCount} item${p.lineCount === 1 ? '' : 's'}) went out to suppliers.</p>`,
            `<p style="margin:0;">${p.matchedSupplierCount} already-registered supplier${p.matchedSupplierCount === 1 ? ' was' : 's were'} matched and notified, and ${p.invitedNewCount} new supplier${p.invitedNewCount === 1 ? ' was' : 's were'} invited.</p>`,
          ].join(''),
          cta: { label: 'View request', url: link },
          footerNote: 'You are receiving this because you submitted a sourcing request on vProcly.',
        }),
      });
    },
    async handler() {}, // nothing to persist; the email itself is the whole effect
  };
}
