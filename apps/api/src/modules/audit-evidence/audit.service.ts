import { Injectable } from '@nestjs/common';
import { appendAudit, auditLog, verifyAuditChain, type Tx } from '@vprocly/db';
import { and, desc, eq } from 'drizzle-orm';
import type { RequestContext } from '../../platform/request-context.js';
import { TenantDb } from '../identity-tenancy/index.js';

export type AuditRecord = {
  action: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(private readonly tenantDb: TenantDb) {}

  /** Records a decision inside the caller's transaction, so it commits or rolls back with the change. */
  record(tx: Tx, ctx: RequestContext, r: AuditRecord): Promise<number> {
    return appendAudit(tx, {
      actorId: ctx.userId,
      actorType: 'user',
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      correlationId: ctx.correlationId,
      data: r.data,
    });
  }

  history(ctx: RequestContext, entityType: string, entityId: string, limit = 100) {
    return this.tenantDb.run(ctx, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
        .orderBy(desc(auditLog.id))
        .limit(limit),
    );
  }

  verify(ctx: RequestContext) {
    return this.tenantDb.run(ctx, (tx) => verifyAuditChain(tx));
  }
}
