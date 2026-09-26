import { Module } from '@nestjs/common';
import { KeycloakAdminService } from './keycloak-admin.service.js';
import { MarketplaceSuppliersController } from './marketplace-suppliers.controller.js';
import { MarketplaceSuppliersService } from './marketplace-suppliers.service.js';
import { WalletService } from './wallet.service.js';

@Module({
  controllers: [MarketplaceSuppliersController],
  providers: [MarketplaceSuppliersService, KeycloakAdminService, WalletService],
  exports: [WalletService],
})
export class MarketplaceSuppliersModule {}
