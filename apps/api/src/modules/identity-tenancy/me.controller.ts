import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { tenants } from '@vprocly/db';
import type { RequestContext } from '../../platform/request-context.js';
import { Ctx } from './decorators.js';
import { TenantDb } from './tenant-db.service.js';

@ApiTags('identity')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly tenantDb: TenantDb) {}

  @Get()
  async me(@Ctx() ctx: RequestContext) {
    const [tenant] = await this.tenantDb.run(ctx, (tx) =>
      tx.select({ id: tenants.id, slug: tenants.slug, name: tenants.name, defaultCurrency: tenants.defaultCurrency }).from(tenants),
    );
    return {
      user: { id: ctx.userId, email: ctx.email, name: ctx.name, roles: ctx.roles },
      tenant,
    };
  }
}
