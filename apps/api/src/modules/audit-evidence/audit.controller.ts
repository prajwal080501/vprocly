import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { RequestContext } from '../../platform/request-context.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { Ctx, Roles } from '../identity-tenancy/index.js';
import { AuditService } from './audit.service.js';

const HistoryQuery = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@Roles('tenant_admin', 'finance_controller')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  history(@Ctx() ctx: RequestContext, @Query(new ZodPipe(HistoryQuery)) q: z.infer<typeof HistoryQuery>) {
    return this.audit.history(ctx, q.entityType, q.entityId, q.limit);
  }

  @Get('verify')
  async verify(@Ctx() ctx: RequestContext) {
    const brokenAt = await this.audit.verify(ctx);
    return { intact: brokenAt === null, brokenAt };
  }
}
