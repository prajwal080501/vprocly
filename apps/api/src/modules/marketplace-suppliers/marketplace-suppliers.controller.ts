import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { Public, SupplierAuthGuard, SupplierCtx, type SupplierRequestContext } from '../identity-tenancy/index.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { ConfirmVoiceBidInput, MarketplaceSuppliersService, PlaceBidInput, SignupInput, SupplierCapabilityInput, SupplierClarificationInput, SupplierNetworkPreferencesInput, SupplierPassportInput, SupplierSelfSignup, UpdateSupplierProfile } from './marketplace-suppliers.service.js';
import { RazorpayService } from './razorpay.service.js';
import { LocationService } from './location.service.js';
import { SupplierOtpRequestInput, SupplierOtpVerifyInput } from './supplier-email-otp.service.js';

const RefillCurrencyInput = z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']);
const CreateRefillOrderInput = z.object({
  packId: z.string().trim().min(1).max(40),
  currency: RefillCurrencyInput,
  customPoints: z.number().int().min(50).max(10_000).optional(),
});
const ConfirmRefillInput = z.object({
  razorpayOrderId: z.string().trim().min(1).max(100),
  razorpayPaymentId: z.string().trim().min(1).max(100),
  razorpaySignature: z.string().trim().min(1).max(200),
});
const DetectLocationInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

@ApiTags('marketplace')
@Controller()
export class MarketplaceSuppliersController {
  constructor(
    private readonly service: MarketplaceSuppliersService,
    private readonly razorpay: RazorpayService,
    private readonly location: LocationService,
  ) {}

  @Get('invites/:token')
  @Public()
  viewInvite(@Param('token') token: string) {
    return this.service.viewInvite(token);
  }

  @Post('invites/:token/signup')
  @Public()
  signup(@Param('token') token: string, @Body(new ZodPipe(SignupInput)) body: z.infer<typeof SignupInput>) {
    return this.service.signup(token, body);
  }

  @Post('invites/:token/otp/request')
  @Public()
  requestInviteOtp(@Param('token') token: string) {
    return this.service.requestInviteOtp(token);
  }

  @Post('invites/:token/otp/verify')
  @Public()
  verifyInviteOtp(@Param('token') token: string, @Body(new ZodPipe(SupplierOtpVerifyInput.pick({ code: true }))) body: { code: string }) {
    return this.service.verifyInviteOtp(token, body.code);
  }

  @Get('bid-confirmations/:token')
  @Public()
  viewBidConfirmation(@Param('token') token: string) {
    return this.service.viewBidConfirmation(token);
  }

  @Post('bid-confirmations/:token/confirm')
  @Public()
  confirmBidFromVoice(
    @Param('token') token: string,
    @Body(new ZodPipe(ConfirmVoiceBidInput)) body: ConfirmVoiceBidInput,
  ) {
    return this.service.confirmBidFromVoice(token, body);
  }

  /** A cold, un-invited supplier creating their own account -- no token needed. */
  @Post('supplier-signup')
  @Public()
  selfSignup(@Body(new ZodPipe(SupplierSelfSignup)) body: SupplierSelfSignup) {
    return this.service.selfSignup(body);
  }

  @Post('supplier-signup/otp/request')
  @Public()
  requestSelfSignupOtp(@Body(new ZodPipe(SupplierOtpRequestInput)) body: z.infer<typeof SupplierOtpRequestInput>) {
    return this.service.requestSelfSignupOtp(body.email);
  }

  @Post('supplier-signup/otp/verify')
  @Public()
  verifySelfSignupOtp(@Body(new ZodPipe(SupplierOtpVerifyInput)) body: z.infer<typeof SupplierOtpVerifyInput>) {
    return this.service.verifySelfSignupOtp(body.email, body.code);
  }

  @Get('supplier/me')
  @Public()
  @UseGuards(SupplierAuthGuard)
  me(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.me(ctx);
  }

  @Patch('supplier/me')
  @Public()
  @UseGuards(SupplierAuthGuard)
  updateMe(@SupplierCtx() ctx: SupplierRequestContext, @Body(new ZodPipe(UpdateSupplierProfile)) body: UpdateSupplierProfile) {
    return this.service.updateMe(ctx, body);
  }

  @Get('supplier/passport')
  @Public()
  @UseGuards(SupplierAuthGuard)
  passport(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.passport(ctx);
  }

  @Patch('supplier/passport')
  @Public()
  @UseGuards(SupplierAuthGuard)
  replacePassport(@SupplierCtx() ctx: SupplierRequestContext, @Body(new ZodPipe(SupplierPassportInput)) body: SupplierPassportInput) {
    return this.service.replacePassport(ctx, body);
  }

  @Get('supplier/network-insights')
  @Public()
  @UseGuards(SupplierAuthGuard)
  networkInsights(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.networkInsights(ctx);
  }

  @Patch('supplier/network-preferences')
  @Public()
  @UseGuards(SupplierAuthGuard)
  updateNetworkPreferences(
    @SupplierCtx() ctx: SupplierRequestContext,
    @Body(new ZodPipe(SupplierNetworkPreferencesInput)) body: SupplierNetworkPreferencesInput,
  ) {
    return this.service.updateNetworkPreferences(ctx, body);
  }

  @Get('supplier/wallet/refill-packs')
  @Public()
  @UseGuards(SupplierAuthGuard)
  refillPacks() {
    return this.razorpay.packs();
  }

  @Post('supplier/wallet/refill-orders')
  @Public()
  @UseGuards(SupplierAuthGuard)
  createRefillOrder(
    @SupplierCtx() ctx: SupplierRequestContext,
    @Body(new ZodPipe(CreateRefillOrderInput)) body: z.infer<typeof CreateRefillOrderInput>,
  ) {
    return this.razorpay.createOrder(ctx.platformSupplierId, body.packId, body.currency, body.customPoints);
  }

  @Post('supplier/location/detect')
  @Public()
  @UseGuards(SupplierAuthGuard)
  detectLocation(@Body(new ZodPipe(DetectLocationInput)) body: z.infer<typeof DetectLocationInput>) {
    return this.location.detect(body.latitude, body.longitude);
  }

  @Post('supplier/wallet/refill-orders/confirm')
  @Public()
  @UseGuards(SupplierAuthGuard)
  confirmRefill(
    @SupplierCtx() ctx: SupplierRequestContext,
    @Body(new ZodPipe(ConfirmRefillInput)) body: z.infer<typeof ConfirmRefillInput>,
  ) {
    return this.razorpay.confirm(ctx.platformSupplierId, body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature);
  }

  @Post('payments/razorpay/webhook')
  @Public()
  razorpayWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    if (!request.rawBody) throw new BadRequestException('Raw webhook body is unavailable');
    return this.razorpay.handleWebhook(request.rawBody, signature, body);
  }

  @Get('supplier/lines')
  @Public()
  @UseGuards(SupplierAuthGuard)
  openLines(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.openLines(ctx);
  }

  @Get('supplier/clarifications')
  @Public()
  @UseGuards(SupplierAuthGuard)
  clarifications(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.clarificationMessages(ctx);
  }

  @Post('supplier/lines/:lineId/clarifications')
  @Public()
  @UseGuards(SupplierAuthGuard)
  postClarification(
    @SupplierCtx() ctx: SupplierRequestContext,
    @Param('lineId') lineId: string,
    @Body(new ZodPipe(SupplierClarificationInput)) body: SupplierClarificationInput,
  ) {
    return this.service.postClarification(ctx, lineId, body);
  }

  @Post('supplier/lines/:lineId/capability')
  @Public()
  @UseGuards(SupplierAuthGuard)
  setCapability(
    @SupplierCtx() ctx: SupplierRequestContext,
    @Param('lineId') lineId: string,
    @Body(new ZodPipe(SupplierCapabilityInput)) body: SupplierCapabilityInput,
  ) {
    return this.service.setCapability(ctx, lineId, body);
  }

  @Get('supplier/bids')
  @Public()
  @UseGuards(SupplierAuthGuard)
  bids(@SupplierCtx() ctx: SupplierRequestContext) {
    return this.service.bidActivity(ctx);
  }

  @Post('supplier/lines/:lineId/bids')
  @Public()
  @UseGuards(SupplierAuthGuard)
  placeBid(
    @SupplierCtx() ctx: SupplierRequestContext,
    @Param('lineId') lineId: string,
    @Body(new ZodPipe(PlaceBidInput)) body: PlaceBidInput,
  ) {
    return this.service.placeBid(ctx, lineId, body);
  }
}
