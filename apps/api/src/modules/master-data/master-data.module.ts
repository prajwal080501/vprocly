import { Module } from '@nestjs/common';
import { AuditEvidenceModule } from '../audit-evidence/index.js';
import { SuppliersController } from './suppliers.controller.js';
import { SuppliersService } from './suppliers.service.js';

@Module({
  imports: [AuditEvidenceModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class MasterDataModule {}
