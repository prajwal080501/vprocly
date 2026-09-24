import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { suppliers } from '@vprocly/db';
import { asc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from '../../platform/db-errors.js';
import { EventsService } from '../../platform/events.service.js';
import type { RequestContext } from '../../platform/request-context.js';
import { AuditService } from '../audit-evidence/index.js';
import { TenantDb } from '../identity-tenancy/index.js';

export const CreateSupplier = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  taxId: z.string().trim().max(32).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(32).optional(),
});
export type CreateSupplier = z.infer<typeof CreateSupplier>;

export const ListSuppliers = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListSuppliers = z.infer<typeof ListSuppliers>;

/**
 * Reference pattern for every write in vProcly: the state change, its audit record and its domain event
 * commit in one tenant-scoped transaction.
 */
@Injectable()
export class SuppliersService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  list(ctx: RequestContext, q: ListSuppliers) {
    return this.tenantDb.run(ctx, (tx) =>
      tx
        .select()
        .from(suppliers)
        .where(q.q ? or(ilike(suppliers.name, `%${q.q}%`), ilike(suppliers.code, `%${q.q}%`)) : undefined)
        .orderBy(asc(suppliers.name))
        .limit(q.limit)
        .offset(q.offset),
    );
  }

  async get(ctx: RequestContext, id: string) {
    const [row] = await this.tenantDb.run(ctx, (tx) => tx.select().from(suppliers).where(eq(suppliers.id, id)));
    if (!row) throw new NotFoundException();
    return row;
  }

  async create(ctx: RequestContext, input: CreateSupplier) {
    try {
      return await this.tenantDb.run(ctx, async (tx) => {
        const [row] = await tx
          .insert(suppliers)
          .values({
            ...input,
            tenantId: ctx.tenantId,
            sourceSystem: 'manual',
            createdBy: ctx.userId,
            correlationId: ctx.correlationId,
          })
          .returning();
        await this.audit.record(tx, ctx, {
          action: 'supplier.created',
          entityType: 'supplier',
          entityId: row!.id,
          data: { code: row!.code, name: row!.name },
        });
        await this.events.emit(tx, ctx, {
          type: 'master_data.supplier_created',
          version: 1,
          aggregateType: 'supplier',
          aggregateId: row!.id,
          payload: { supplierId: row!.id, code: row!.code, name: row!.name, sourceSystem: row!.sourceSystem },
        });
        return row!;
      });
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw new ConflictException(`Supplier code ${input.code} exists`);
      throw err;
    }
  }
}
