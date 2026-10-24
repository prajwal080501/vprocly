import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../../platform/request-context.js';
import { Ctx, Roles } from '../identity-tenancy/index.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { OperationsService, ReviewItemEquivalence } from './operations.service.js';

@ApiTags('operations')
@ApiBearerAuth()
@Controller('operations')
@Roles('tenant_admin')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('summary')
  summary(@Ctx() ctx: RequestContext) {
    return this.operations.summary(ctx);
  }

  @Patch('item-equivalences/:id')
  reviewItemEquivalence(
    @Ctx() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodPipe(ReviewItemEquivalence)) body: ReviewItemEquivalence,
  ) {
    return this.operations.reviewItemEquivalence(ctx, id, body);
  }
}
