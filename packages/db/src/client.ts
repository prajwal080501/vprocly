import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Pool = pg.Pool;
export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export type TenantContext = {
  tenantId: string;
  userId?: string;
  correlationId?: string;
};

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max });
}

export function createDatabase(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}

/**
 * Runs fn in a transaction bound to one tenant. Row-level security reads app.tenant_id, so a query
 * outside this helper (or with the wrong tenant) sees no tenant data.
 */
export async function withTenant<T>(db: Database, ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT set_config('app.tenant_id', ${ctx.tenantId}, true),
             set_config('app.user_id', ${ctx.userId ?? ''}, true),
             set_config('app.correlation_id', ${ctx.correlationId ?? ''}, true)`);
    return fn(tx);
  });
}
