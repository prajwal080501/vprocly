import { sql } from 'drizzle-orm';
import type { Tx } from './client.js';

/**
 * Atomically creates a tenant, racing against the slug's unique constraint rather than a separate
 * check-then-insert (which would have a race between the check and the insert). Returns false if the slug
 * was already taken; the caller should retry with a different slug, not treat it as a hard error.
 */
export async function createTenant(tx: Tx, input: { id: string; slug: string; name: string }): Promise<boolean> {
  const res = await tx.execute<{ create_tenant: boolean }>(
    sql`SELECT create_tenant(${input.id}::uuid, ${input.slug}, ${input.name}) AS create_tenant`,
  );
  return Boolean(res.rows[0]?.create_tenant);
}
