import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { RequestContext } from '../../platform/request-context.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { Ctx } from '../identity-tenancy/index.js';
import { CreateUpload, DocumentsService } from './documents.service.js';

const CompleteUpload = z.object({ purpose: CreateUpload.shape.purpose });

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('uploads')
  createUpload(@Ctx() ctx: RequestContext, @Body(new ZodPipe(CreateUpload)) body: CreateUpload) {
    return this.documents.createUpload(ctx, body);
  }

  @Post(':id/complete')
  complete(
    @Ctx() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CompleteUpload)) body: z.infer<typeof CompleteUpload>,
  ) {
    return this.documents.completeUpload(ctx, id, body.purpose);
  }

  @Get(':id/download-url')
  downloadUrl(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.downloadUrl(ctx, id);
  }

  @Get(':id')
  get(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.get(ctx, id);
  }
}
