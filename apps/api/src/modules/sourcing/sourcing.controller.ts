import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { RequestContext } from '../../platform/request-context.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { Ctx, Roles } from '../identity-tenancy/index.js';
import { CreateManualRequest, ImportBomRequest, SourcingService } from './sourcing.service.js';

@ApiTags('sourcing')
@ApiBearerAuth()
@Controller('sourcing-requests')
export class SourcingController {
  constructor(private readonly sourcing: SourcingService) {}

  /** Category list + fixed BOM column names, for the "add items" and "download template" UI. */
  @Get('bom-template')
  bomTemplate() {
    return { fields: this.sourcing.bomTemplateFields() };
  }

  @Get()
  list(@Ctx() ctx: RequestContext) {
    return this.sourcing.list(ctx);
  }

  @Get(':id')
  get(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sourcing.get(ctx, id);
  }

  @Post()
  @Roles('buyer', 'requester', 'tenant_admin')
  createManual(@Ctx() ctx: RequestContext, @Body(new ZodPipe(CreateManualRequest)) body: CreateManualRequest) {
    return this.sourcing.createManual(ctx, body);
  }

  @Post('import')
  @Roles('buyer', 'requester', 'tenant_admin')
  importBom(@Ctx() ctx: RequestContext, @Body(new ZodPipe(ImportBomRequest)) body: z.infer<typeof ImportBomRequest>) {
    return this.sourcing.importBom(ctx, body);
  }
}
