import { INVITE_TOKEN_TTL_DAYS } from '@vprocly/contracts';
import { renderDetailsTable, renderEmailHtml } from '../email-template.js';

export type InviteLineInfo = {
  itemCode: string | null;
  description: string;
  qty: string;
  uom: string;
  categoryName: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string | null;
};

/** Shared wording between the automatic invite mailer and the manual "Email now" action, so the two paths
 *  can't drift apart. */
export function buildInviteEmailContent(line: InviteLineInfo, link: string) {
  const detailRows: Array<[string, string]> = [
    ...(line.itemCode ? ([['Item code', line.itemCode]] as Array<[string, string]>) : []),
    ['Item', line.description],
    ['Category', line.categoryName],
    ['Quantity', `${line.qty} ${line.uom}`],
    ['Delivery to', `${line.deliveryCity}, ${line.deliveryState}`],
    ...(line.needBy ? ([['Needed by', line.needBy]] as Array<[string, string]>) : []),
  ];

  return {
    subject: `New sourcing opportunity: ${line.description}`,
    text: [
      `You have been matched to a sourcing opportunity on vProcly.`,
      ``,
      ...(line.itemCode ? [`Item code: ${line.itemCode}`] : []),
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
    html: renderEmailHtml({
      preheader: `You've been matched to a new sourcing opportunity: ${line.description}`,
      heading: 'New sourcing opportunity',
      bodyHtml: `<p style="margin:0 0 4px;">You have been matched to a sourcing opportunity on vProcly.</p>${renderDetailsTable(detailRows)}`,
      cta: { label: 'View and get started', url: link },
      footerNote: `This link expires in ${INVITE_TOKEN_TTL_DAYS} days.`,
    }),
  };
}
