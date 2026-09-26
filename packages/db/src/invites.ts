import { sql } from 'drizzle-orm';
import type { Tx } from './client.js';

export type SourcingLineInvite = {
  email: string;
  consumed: boolean;
  description: string;
  qty: string;
  uom: string;
  category_id: string;
  delivery_city: string;
  delivery_state: string;
  need_by: string | null;
};

/** Public, cross-tenant, token-authenticated lookup. See migration 0006 for exactly which columns this can return. */
export async function resolveSourcingLineInvite(tx: Tx, tokenHash: string): Promise<SourcingLineInvite | null> {
  const res = await tx.execute<SourcingLineInvite>(sql`SELECT * FROM resolve_sourcing_line_invite(${tokenHash})`);
  return res.rows[0] ?? null;
}

/** Marks the invite consumed and links every other pending invite for the same email to the new account. */
export async function consumeSourcingLineInvite(tx: Tx, tokenHash: string, platformSupplierId: string): Promise<boolean> {
  const res = await tx.execute<{ consume_sourcing_line_invite: boolean }>(
    sql`SELECT consume_sourcing_line_invite(${tokenHash}, ${platformSupplierId}::uuid) AS consume_sourcing_line_invite`,
  );
  return Boolean(res.rows[0]?.consume_sourcing_line_invite);
}
