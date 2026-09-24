import { Inject, Injectable } from '@nestjs/common';
import { tenants, users, withTenant, type Database, type Tx } from '@vprocly/db';
import { sql } from 'drizzle-orm';
import { DATABASE } from '../../platform/database.module.js';
import type { RequestContext } from '../../platform/request-context.js';

type Identity = { tenantId: string; subject: string; email?: string; name?: string };

/** The only way request code reaches tenant data: every call runs in a transaction bound to ctx.tenantId. */
@Injectable()
export class TenantDb {
  private readonly userIds = new Map<string, string>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  run<T>(ctx: Pick<RequestContext, 'tenantId' | 'userId' | 'correlationId'>, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withTenant(this.db, ctx, fn);
  }

  /**
   * Resolves the internal user id for a token identity, creating the user on first sight (JIT provisioning).
   * Returns null when the token's tenant does not exist.
   */
  async resolveUser(identity: Identity): Promise<string | null> {
    const key = `${identity.tenantId}:${identity.subject}`;
    const cached = this.userIds.get(key);
    if (cached) return cached;

    const userId = await withTenant(this.db, { tenantId: identity.tenantId }, async (tx) => {
      const [tenant] = await tx.select({ id: tenants.id }).from(tenants);
      if (!tenant) return null;
      const [row] = await tx
        .insert(users)
        .values({
          tenantId: identity.tenantId,
          subject: identity.subject,
          email: identity.email,
          displayName: identity.name,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [users.tenantId, users.subject],
          set: { email: identity.email, displayName: identity.name, lastSeenAt: sql`now()` },
        })
        .returning({ id: users.id });
      return row!.id;
    });
    if (userId) this.userIds.set(key, userId);
    return userId;
  }
}
