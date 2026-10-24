import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AuditEvidenceModule } from './modules/audit-evidence/index.js';
import { CategoriesModule } from './modules/categories/index.js';
import { DocumentsModule } from './modules/documents/index.js';
import { IdentityTenancyModule } from './modules/identity-tenancy/index.js';
import { MarketplaceSuppliersModule } from './modules/marketplace-suppliers/index.js';
import { MasterDataModule } from './modules/master-data/index.js';
import { OrganizationsModule } from './modules/organizations/index.js';
import { OperationsModule } from './modules/operations/operations.module.js';
import { SourcingModule } from './modules/sourcing/index.js';
import { VoiceOutreachModule } from './modules/voice-outreach/index.js';
import { CorrelationMiddleware } from './platform/correlation.middleware.js';
import { ObservabilityMiddleware } from './platform/observability.middleware.js';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [
    PlatformModule,
    IdentityTenancyModule,
    AuditEvidenceModule,
    CategoriesModule,
    DocumentsModule,
    MasterDataModule,
    MarketplaceSuppliersModule,
    SourcingModule,
    OrganizationsModule,
    OperationsModule,
    VoiceOutreachModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware, ObservabilityMiddleware).forRoutes('*path');
  }
}
