import { Module } from '@nestjs/common';
import { AuditEvidenceModule } from '../audit-evidence/index.js';
import { DocumentsModule } from '../documents/index.js';
import { SourcingController } from './sourcing.controller.js';
import { SourcingService } from './sourcing.service.js';

@Module({
  imports: [AuditEvidenceModule, DocumentsModule],
  controllers: [SourcingController],
  providers: [SourcingService],
  exports: [SourcingService],
})
export class SourcingModule {}
