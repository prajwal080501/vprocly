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
};

/** Everything a supplier is matched to and can still bid on. See migration 0012 for exactly which columns
 *  this can return -- never the buyer/tenant. */
export async function listOpenLinesForSupplier(tx: Tx, platformSupplierId: string): Promise<OpenLineForSupplier[]> {
  const res = await tx.execute<OpenLineForSupplier>(sql`SELECT * FROM list_open_lines_for_supplier(${platformSupplierId}::uuid)`);
  return res.rows;
}

/** Inserts or updates the caller's one active bid on a line. Throws (message 'line_not_open' or
 *  'not_matched') if the line isn't open or this supplier was never matched to it -- callers translate
 *  those into a clean 4xx, never surface the raw Postgres error. */
export async function submitSupplierBid(
  tx: Tx,
  params: { platformSupplierId: string; sourcingLineId: string; unitPrice: string; leadTimeDays: number | null; notes: string | null },
): Promise<{ id: string; isNew: boolean }> {
  const res = await tx.execute<{ id: string; is_new: boolean }>(
    sql`SELECT * FROM submit_supplier_bid(${params.platformSupplierId}::uuid, ${params.sourcingLineId}::uuid, ${params.unitPrice}::numeric, ${params.leadTimeDays}::integer, ${params.notes})`,
  );
  const row = res.rows[0]!;
  return { id: row.id, isNew: row.is_new };
}
