import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { RequestContext } from '../../platform/request-context.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { Ctx, Roles } from '../identity-tenancy/index.js';
import { CreateSupplier, ListSuppliers, SuppliersService } from './suppliers.service.js';

@ApiTags('master-data')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@Ctx() ctx: RequestContext, @Query(new ZodPipe(ListSuppliers)) q: ListSuppliers) {
    return this.suppliers.list(ctx, q);
  }

  @Get(':id')
  get(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(ctx, id);
  }

  @Post()
  @Roles('tenant_admin', 'buyer')
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(CreateSupplier)) body: CreateSupplier) {
    return this.suppliers.create(ctx, body);
  }
}
