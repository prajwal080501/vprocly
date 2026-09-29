import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public, SupplierAuthGuard, SupplierCtx, type SupplierRequestContext } from '../identity-tenancy/index.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { MarketplaceSuppliersService, PlaceBidInput, SignupInput, SupplierSelfSignup, UpdateSupplierProfile } from './marketplace-suppliers.service.js';

@ApiTags('marketplace')
@Controller()
export class MarketplaceSuppliersController {
  constructor(private readonly service: MarketplaceSuppliersService) {}

  @Get('invites/:token')
  @Public()
  viewInvite(@Param('token') token: string) {
    return this.service.viewInvite(token);
  }

  @Post('invites/:token/signup')
  @Public()
  signup(@Param('token') token: string, @Body(new ZodPipe(SignupInput)) body: z.infer<typeof SignupInput>) {
    return this.service.signup(token, body);
  }

  /** A cold, un-invited supplier creating their own account -- no token needed. */
  @Post('supplier-signup')
  @Public()
  selfSignup(@Body(new ZodPipe(SupplierSelfSignup)) body: SupplierSelfSignup) {
    return this.service.selfSignup(body);
  }

  @Get('supplier/me')
  @Public()
  @UseGuards(SupplierAuthGuard)
  me(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.me(ctx);
  }

  @Patch('supplier/me')
  @Public()
  @UseGuards(SupplierAuthGuard)
  updateMe(@SupplierCtx() ctx: SupplierRequestContext, @Body(new ZodPipe(UpdateSupplierProfile)) body: UpdateSupplierProfile) {
    return this.service.updateMe(ctx, body);
  }

  @Get('supplier/lines')
  @Public()
  @UseGuards(SupplierAuthGuard)
  openLines(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.openLines(ctx);
  }

  @Get('supplier/bids')
  @Public()
  @UseGuards(SupplierAuthGuard)
  bids(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.bidActivity(ctx);
  }

  @Post('supplier/lines/:lineId/bids')
  @Public()
  @UseGuards(SupplierAuthGuard)
  placeBid(
    @SupplierCtx() ctx: SupplierRequestContext,
    @Param('lineId') lineId: string,
    @Body(new ZodPipe(PlaceBidInput)) body: PlaceBidInput,
  ) {
    return this.service.placeBid(ctx, lineId, body);
  }
}
