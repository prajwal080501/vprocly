import { Inject, Injectable } from '@nestjs/common';
import type { Database, Tx } from '@vprocly/db';
import { DATABASE } from './database.module.js';

/**
 * The platform-level equivalent of TenantDb: for tables with no tenant_id and no RLS (marketplace suppliers,
 * wallets, categories -- see packages/db/src/schema/marketplace.ts). A caller is scoped to their own
 * platformSupplierId by the service layer, not by the database. Never use this for tenant tables.
 */
@Injectable()
export class PlatformDb {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }
}
