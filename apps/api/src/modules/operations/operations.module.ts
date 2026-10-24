import { Module } from '@nestjs/common';
import { IdentityTenancyModule } from '../identity-tenancy/index.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';

@Module({
  imports: [IdentityTenancyModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
