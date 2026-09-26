import { Module } from '@nestjs/common';
import { MarketplaceSuppliersController } from './marketplace-suppliers.controller.js';
import { MarketplaceSuppliersService } from './marketplace-suppliers.service.js';
import { WalletService } from './wallet.service.js';

@Module({
  controllers: [MarketplaceSuppliersController],
  providers: [MarketplaceSuppliersService, WalletService],
  exports: [WalletService],
})
export class MarketplaceSuppliersModule {}
