import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/index.js';
import { MarketplaceSuppliersController } from './marketplace-suppliers.controller.js';
import { MarketplaceSuppliersService } from './marketplace-suppliers.service.js';
import { WalletService } from './wallet.service.js';
import { RazorpayService } from './razorpay.service.js';
import { LocationService } from './location.service.js';
import { SupplierEmailOtpService } from './supplier-email-otp.service.js';

@Module({
  imports: [CategoriesModule],
  controllers: [MarketplaceSuppliersController],
  providers: [MarketplaceSuppliersService, WalletService, RazorpayService, LocationService, SupplierEmailOtpService],
  exports: [WalletService],
})
export class MarketplaceSuppliersModule {}
