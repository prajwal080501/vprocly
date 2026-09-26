import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../identity-tenancy/index.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { OrganizationSignup, OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post('signup')
  @Public()
  signup(@Body(new ZodPipe(OrganizationSignup)) body: OrganizationSignup) {
    return this.organizations.signup(body);
  }
}
