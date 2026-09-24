import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AuditEvidenceModule } from './modules/audit-evidence/index.js';
import { DocumentsModule } from './modules/documents/index.js';
import { IdentityTenancyModule } from './modules/identity-tenancy/index.js';
import { MasterDataModule } from './modules/master-data/index.js';
import { CorrelationMiddleware } from './platform/correlation.middleware.js';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [PlatformModule, IdentityTenancyModule, AuditEvidenceModule, DocumentsModule, MasterDataModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*path');
  }
}
