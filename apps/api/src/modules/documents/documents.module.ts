import { Module } from '@nestjs/common';
import { AuditEvidenceModule } from '../audit-evidence/index.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { ObjectStorage } from './object-storage.service.js';

@Module({
  imports: [AuditEvidenceModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, ObjectStorage],
  exports: [DocumentsService, ObjectStorage],
})
export class DocumentsModule {}
