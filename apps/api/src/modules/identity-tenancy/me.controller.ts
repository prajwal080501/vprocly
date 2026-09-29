import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { tenants, users } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ZodPipe } from '../../platform/zod.pipe.js';
import type { RequestContext } from '../../platform/request-context.js';
import { Ctx } from './decorators.js';
import { TenantDb } from './tenant-db.service.js';

const UpdateMe = z.object({
  phone: z.string().trim().min(1).max(32).nullable().optional(),
});
type UpdateMe = z.infer<typeof UpdateMe>;

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
    const [user] = await this.tenantDb.run(ctx, (tx) => tx.select({ phone: users.phone }).from(users).where(eq(users.id, ctx.userId)));
    return {
      user: { id: ctx.userId, email: ctx.email, name: ctx.name, roles: ctx.roles, phone: user?.phone ?? null },
      tenant,
    };
  }

  /** Self-service contact field -- never touches email/displayName, so it can't fight with the
   *  JIT-provisioning upsert in tenant-db.service.ts's resolveUser, which runs on every login. */
  @Patch()
  async updateMe(@Ctx() ctx: RequestContext, @Body(new ZodPipe(UpdateMe)) body: UpdateMe) {
    await this.tenantDb.run(ctx, (tx) => tx.update(users).set({ phone: body.phone ?? null }).where(eq(users.id, ctx.userId)));
    return this.me(ctx);
  }
}
