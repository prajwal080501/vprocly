import { sql } from 'drizzle-orm';
import type { Tx } from './client.js';

export type AuditEntry = {
  actorId?: string | null;
  actorType: 'user' | 'system' | 'supplier' | 'ai';
  action: string;
  entityType: string;
  entityId: string;
  correlationId?: string | null;
  data?: Record<string, unknown>;
};

/** Appends to the tenant's hash-chained audit log inside the caller's transaction. */
export async function appendAudit(tx: Tx, e: AuditEntry): Promise<number> {
  const res = await tx.execute<{ id: string }>(sql`
    SELECT audit_append(${e.actorId ?? null}::uuid, ${e.actorType}, ${e.action}, ${e.entityType},
                        ${e.entityId}, ${e.correlationId ?? null}::uuid, ${JSON.stringify(e.data ?? {})}::jsonb) AS id`);
  return Number(res.rows[0]!.id);
}

/** Returns the id of the first tampered audit record for the current tenant, or null if the chain is intact. */
export async function verifyAuditChain(tx: Tx): Promise<number | null> {
  const res = await tx.execute<{ broken: string | null }>(sql`SELECT audit_verify_chain() AS broken`);
  const broken = res.rows[0]?.broken;
  return broken == null ? null : Number(broken);
}
