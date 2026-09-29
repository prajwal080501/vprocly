import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/index.js';
import { MarketplaceSuppliersController } from './marketplace-suppliers.controller.js';
import { MarketplaceSuppliersService } from './marketplace-suppliers.service.js';
import { WalletService } from './wallet.service.js';

@Module({
  imports: [CategoriesModule],
  controllers: [MarketplaceSuppliersController],
  providers: [MarketplaceSuppliersService, WalletService],
  exports: [WalletService],
})
export class MarketplaceSuppliersModule {}
