import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { RequestContext } from '../../platform/request-context.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { Ctx, Public, Roles } from '../identity-tenancy/index.js';
import { CreateManualRequest, ImportBomRequest, InviteToLineInput, SourcingService } from './sourcing.service.js';

@ApiTags('sourcing')
@ApiBearerAuth()
@Controller('sourcing-requests')
export class SourcingController {
  constructor(private readonly sourcing: SourcingService) {}

  /** Category list + fixed BOM column names, for the "add items" and "download template" UI. */
  @Get('bom-template')
  @Public()
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

  @Delete(':id')
  @Roles('buyer', 'requester', 'tenant_admin')
  @HttpCode(204)
  remove(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sourcing.remove(ctx, id);
  }

  @Post(':requestId/lines/:lineId/bids/:bidId/accept')
  @Roles('buyer', 'tenant_admin')
  acceptBid(
    @Ctx() ctx: RequestContext,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Param('bidId', ParseUUIDPipe) bidId: string,
  ) {
    return this.sourcing.acceptBid(ctx, requestId, lineId, bidId);
  }

  @Post(':requestId/lines/:lineId/invite')
  @Roles('buyer', 'requester', 'tenant_admin')
  inviteToLine(
    @Ctx() ctx: RequestContext,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body(new ZodPipe(InviteToLineInput)) body: InviteToLineInput,
  ) {
    return this.sourcing.inviteToLine(ctx, requestId, lineId, body.emails);
  }

  @Post(':requestId/lines/:lineId/research/retry')
  @Roles('buyer', 'requester', 'tenant_admin')
  retryResearch(
    @Ctx() ctx: RequestContext,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.sourcing.retryResearch(ctx, requestId, lineId);
  }

  @Post(':requestId/lines/:lineId/notifications/:notificationId/manual-email')
  @Roles('buyer', 'requester', 'tenant_admin')
  manualEmail(
    @Ctx() ctx: RequestContext,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.sourcing.manualEmail(ctx, requestId, lineId, notificationId);
  }

  @Post(':requestId/lines/:lineId/notifications/:notificationId/manual-call')
  @Roles('buyer', 'requester', 'tenant_admin')
  manualCall(
    @Ctx() ctx: RequestContext,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.sourcing.manualCall(ctx, requestId, lineId, notificationId);
  }
}
