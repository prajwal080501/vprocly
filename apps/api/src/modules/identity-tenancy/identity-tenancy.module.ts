import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { KeycloakAdminService } from './keycloak-admin.service.js';
import { MeController } from './me.controller.js';
import { TenantDb } from './tenant-db.service.js';

@Global()
@Module({
  controllers: [MeController],
  providers: [TenantDb, KeycloakAdminService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [TenantDb, KeycloakAdminService],
})
export class IdentityTenancyModule {}
