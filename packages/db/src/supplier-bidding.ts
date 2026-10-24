import { sql } from 'drizzle-orm';
import type { Tx } from './client.js';

export type OpenLineForSupplier = {
  sourcing_line_id: string;
  item_code: string | null;
  description: string;
  qty: string;
  uom: string;
  need_by: string | null;
  already_bid: boolean;
  my_unit_price: string | null;
  my_minimum_order_qty: string | null;
};

export type SupplierBidActivity = {
  bid_id: string;
  sourcing_line_id: string;
  item_code: string | null;
  description: string;
  qty: string;
  uom: string;
  delivery_city: string;
  delivery_state: string;
  need_by: string | null;
  unit_price: string;
  minimum_order_qty: string | null;
  lead_time_days: number | null;
  notes: string | null;
  bid_status: string;
  buyer_name: string | null;
  buyer_contact_name: string | null;
  buyer_contact_email: string | null;
};

export type VoiceBidConfirmation = {
  draft_id: string;
  status: string;
  supplier_name: string;
  item_code: string | null;
  description: string;
  qty: string;
  uom: string;
  delivery_city: string;
  delivery_state: string;
  need_by: string | null;
  unit_price: string | null;
  minimum_order_qty: string | null;
  lead_time_days: number | null;
  currency: string;
  tax_percent: string | null;
  freight_amount: string | null;
  quote_validity_date: string | null;
  notes: string | null;
  expires_at: string | null;
};

/** Everything a supplier is matched to and can still bid on. See migration 0012 for exactly which columns
 *  this can return -- never the buyer/tenant. */
export async function listOpenLinesForSupplier(tx: Tx, platformSupplierId: string): Promise<OpenLineForSupplier[]> {
  const res = await tx.execute<OpenLineForSupplier>(sql`SELECT * FROM list_open_lines_for_supplier(${platformSupplierId}::uuid)`);
  return res.rows;
}

/** Bid history for one supplier. The SQL function deliberately nulls buyer identity unless this supplier
 * won the line, making reveal-on-accept a database contract rather than a presentation convention. */
export async function listSupplierBidActivity(tx: Tx, platformSupplierId: string): Promise<SupplierBidActivity[]> {
  const res = await tx.execute<SupplierBidActivity>(sql`SELECT * FROM list_supplier_bid_activity(${platformSupplierId}::uuid)`);
  return res.rows;
}

/** Inserts or updates the caller's one active bid on a line. Throws (message 'line_not_open' or
 *  'not_matched') if the line isn't open or this supplier was never matched to it -- callers translate
 *  those into a clean 4xx, never surface the raw Postgres error. */
export async function submitSupplierBid(
  tx: Tx,
  params: { platformSupplierId: string; sourcingLineId: string; unitPrice: string; minimumOrderQty: string | null; leadTimeDays: number | null; notes: string | null },
): Promise<{ id: string; isNew: boolean }> {
  const res = await tx.execute<{ id: string; is_new: boolean }>(
    sql`SELECT * FROM submit_supplier_bid(${params.platformSupplierId}::uuid, ${params.sourcingLineId}::uuid, ${params.unitPrice}::numeric, ${params.minimumOrderQty}::numeric, ${params.leadTimeDays}::integer, ${params.notes})`,
  );
  const row = res.rows[0]!;
  return { id: row.id, isNew: row.is_new };
}

export async function resolveVoiceBidConfirmation(tx: Tx, tokenHash: string): Promise<VoiceBidConfirmation | null> {
  const result = await tx.execute<VoiceBidConfirmation>(sql`SELECT * FROM resolve_bid_confirmation(${tokenHash})`);
  return result.rows[0] ?? null;
}

export async function confirmVoiceBid(
  tx: Tx,
  params: {
    tokenHash: string;
    unitPrice: string;
    minimumOrderQty: string | null;
    leadTimeDays: number;
    currency: string;
    taxPercent: string | null;
    freightAmount: string | null;
    quoteValidityDate: string | null;
    notes: string | null;
  },
): Promise<{ bidId: string; draftId: string; isNew: boolean }> {
  const result = await tx.execute<{ bid_id: string; draft_id: string; is_new: boolean }>(sql`
    SELECT * FROM confirm_voice_bid(
      ${params.tokenHash}, ${params.unitPrice}::numeric, ${params.minimumOrderQty}::numeric,
      ${params.leadTimeDays}::integer, ${params.currency}, ${params.taxPercent}::numeric,
      ${params.freightAmount}::numeric, ${params.quoteValidityDate}::date, ${params.notes}
    )
  `);
  const row = result.rows[0]!;
  return { bidId: row.bid_id, draftId: row.draft_id, isNew: row.is_new };
}
