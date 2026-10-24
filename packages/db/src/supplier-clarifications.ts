import { sql } from 'drizzle-orm';
import type { Tx } from './client.js';

export type SupplierClarificationMessageRow = {
  id: string;
  sourcing_line_id: string;
  sender_type: 'buyer' | 'supplier';
  sender_label: string;
  body: string;
  created_at: Date;
};

export type SupplierLineResponseRow = {
  sourcing_line_id: string;
  status: 'can_supply' | 'needs_clarification' | 'declined';
  reason: string | null;
  responded_at: Date;
};

export async function listSupplierItemClarifications(tx: Tx, platformSupplierId: string, sourcingLineId?: string) {
  const result = sourcingLineId
    ? await tx.execute<SupplierClarificationMessageRow>(sql`SELECT * FROM list_supplier_item_clarifications(${platformSupplierId}::uuid, ${sourcingLineId}::uuid)`)
    : await tx.execute<SupplierClarificationMessageRow>(sql`SELECT * FROM list_supplier_item_clarifications(${platformSupplierId}::uuid, NULL)`);
  return result.rows;
}

export async function postSupplierItemClarification(tx: Tx, platformSupplierId: string, sourcingLineId: string, body: string) {
  const result = await tx.execute<{ id: string }>(
    sql`SELECT post_supplier_item_clarification(${platformSupplierId}::uuid, ${sourcingLineId}::uuid, ${body}) AS id`,
  );
  return result.rows[0]!.id;
}

export async function listSupplierLineResponses(tx: Tx, platformSupplierId: string) {
  const result = await tx.execute<SupplierLineResponseRow>(sql`SELECT * FROM list_supplier_line_responses(${platformSupplierId}::uuid)`);
  return result.rows;
}

export async function setSupplierLineResponse(
  tx: Tx,
  platformSupplierId: string,
  sourcingLineId: string,
  status: SupplierLineResponseRow['status'],
  reason: string | null,
) {
  const result = await tx.execute<{ id: string }>(
    sql`SELECT set_supplier_line_response(${platformSupplierId}::uuid, ${sourcingLineId}::uuid, ${status}, ${reason}) AS id`,
  );
  return result.rows[0]!.id;
}
