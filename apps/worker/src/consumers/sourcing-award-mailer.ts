import { bids, platformSuppliers, sourcingLines, sourcingRequests, tenants, users, withTenant, type Database } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { Mailers } from '../mailer.js';
import { renderDetailsTable, renderEmailHtml } from '../email-template.js';

/** Notifies every bidder after an award. Only the accepted supplier receives buyer identity; rejection
 * messages deliberately use only line and bid data, preserving the blind-bid rule after selection. */
export function sourcingAwardMailer(deps: { db: Database; mailers: Mailers; publicWebUrl: string }): ConsumerDefinition {
  return {
    name: 'sourcing-award-mailer',
    filterSubjects: ['vprocly.*.sourcing.bid_accepted.v1'],
    async prepare(event) {
      const lineId = String(event.payload.sourcingLineId);
      const rows = await withTenant(deps.db, { tenantId: event.tenantId }, (tx) =>
        tx
          .select({
            bidId: bids.id,
            bidStatus: bids.status,
            supplierEmail: platformSuppliers.email,
            supplierName: platformSuppliers.name,
            itemCode: sourcingLines.itemCode,
            description: sourcingLines.description,
            qty: sourcingLines.qty,
            uom: sourcingLines.uom,
            deliveryCity: sourcingLines.deliveryCity,
            deliveryState: sourcingLines.deliveryState,
            needBy: sourcingLines.needBy,
            buyerName: tenants.name,
            buyerContactName: users.displayName,
            buyerContactEmail: users.email,
          })
          .from(bids)
          .innerJoin(platformSuppliers, eq(platformSuppliers.id, bids.platformSupplierId))
          .innerJoin(sourcingLines, eq(sourcingLines.id, bids.sourcingLineId))
          .innerJoin(sourcingRequests, eq(sourcingRequests.id, sourcingLines.sourcingRequestId))
          .innerJoin(tenants, eq(tenants.id, sourcingLines.tenantId))
          .leftJoin(users, eq(users.id, sourcingRequests.createdBy))
          .where(eq(bids.sourcingLineId, lineId)),
      );

      for (const row of rows) {
        const accepted = row.bidStatus === 'accepted';
        const details: Array<[string, string]> = [
          ...(row.itemCode ? ([['Item code', row.itemCode]] as Array<[string, string]>) : []),
          ['Item', row.description],
          ['Quantity', `${row.qty} ${row.uom}`],
          ...(accepted ? ([['Buyer', row.buyerName], ['Deliver to', `${row.deliveryCity}, ${row.deliveryState}`]] as Array<[string, string]>) : []),
          ...(accepted && row.needBy ? ([['Needed by', row.needBy]] as Array<[string, string]>) : []),
          ...(accepted && row.buyerContactEmail ? ([['Buyer contact', `${row.buyerContactName ?? row.buyerContactEmail} · ${row.buyerContactEmail}`]] as Array<[string, string]>) : []),
        ];
        await deps.mailers.noreply.sendMail({
          from: deps.mailers.noreplyFrom,
          to: row.supplierEmail,
          subject: accepted ? `Bid accepted: ${row.description}` : `Bid update: ${row.description}`,
          text: accepted
            ? [
                `Congratulations ${row.supplierName}. Your bid for ${row.description} has been accepted by ${row.buyerName}.`,
                `Deliver to: ${row.deliveryCity}, ${row.deliveryState}`,
                row.needBy ? `Needed by: ${row.needBy}` : undefined,
                row.buyerContactEmail ? `Buyer contact: ${row.buyerContactName ?? row.buyerContactEmail} · ${row.buyerContactEmail}` : undefined,
                `View the award details: ${deps.publicWebUrl}/supplier/dashboard`,
              ].filter((line): line is string => line !== undefined).join('\n')
            : `Thank you for bidding on ${row.description}. Another bid was selected. The buyer's identity remains private.`,
          html: renderEmailHtml({
            preheader: accepted ? `Your bid for ${row.description} was accepted.` : `An update on your bid for ${row.description}.`,
            heading: accepted ? 'Your bid was accepted' : 'Bid not selected',
            bodyHtml: `<p style="margin:0 0 12px;">${accepted ? `Congratulations ${row.supplierName}. The buyer details are now available below and in your dashboard.` : `Thank you for bidding. Another quote was selected for this opportunity.`}</p>${renderDetailsTable(details)}`,
            ...(accepted ? { cta: { label: 'View award details', url: `${deps.publicWebUrl}/supplier/dashboard` } } : {}),
            footerNote: accepted ? 'Buyer identity is revealed only to the selected supplier.' : "The buyer's identity remains private for bids that were not selected.",
          }),
        });
      }
    },
    async handler() {},
  };
}
