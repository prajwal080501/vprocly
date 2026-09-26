import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../identity-tenancy/index.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { MarketplaceSuppliersService, SignupInput } from './marketplace-suppliers.service.js';

@ApiTags('marketplace')
@Controller()
export class MarketplaceSuppliersController {
  constructor(private readonly service: MarketplaceSuppliersService) {}

  /** Fixed taxonomy for the buyer's line-item form and the supplier signup form. No auth needed to read it. */
  @Get('categories')
  @Public()
  categories() {
    return this.service.listCategories();
  }

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
}
