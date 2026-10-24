import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { walletRefillOrders } from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import Razorpay from 'razorpay';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { PlatformDb } from '../../platform/platform-db.service.js';
import { WalletService } from './wallet.service.js';

export const REFILL_CURRENCIES = [
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'SGD', label: 'Singapore Dollar' },
] as const;
export type RefillCurrency = (typeof REFILL_CURRENCIES)[number]['code'];

export const REFILL_PACKS: ReadonlyArray<{
  id: string;
  points: number;
  label: string;
  amounts: Record<RefillCurrency, number>;
}> = [
  { id: 'starter', points: 100, label: 'Starter', amounts: { INR: 9900, USD: 199, EUR: 199, GBP: 199, AED: 699, SGD: 299 } },
  { id: 'growth', points: 500, label: 'Growth', amounts: { INR: 39900, USD: 599, EUR: 549, GBP: 499, AED: 2199, SGD: 799 } },
  { id: 'scale', points: 1500, label: 'Scale', amounts: { INR: 99900, USD: 1399, EUR: 1299, GBP: 1099, AED: 5199, SGD: 1899 } },
];

export const CUSTOM_REFILL = { minPoints: 50, maxPoints: 10_000, step: 50, defaultPoints: 250, basePoints: 100 } as const;

export function resolveRefillPurchase(packId: string, currency: RefillCurrency, customPoints?: number) {
  if (!REFILL_CURRENCIES.some((candidate) => candidate.code === currency)) throw new BadRequestException('Unsupported refill currency');
  if (packId === 'custom') {
    const points = customPoints ?? 0;
    if (!Number.isInteger(points) || points < CUSTOM_REFILL.minPoints || points > CUSTOM_REFILL.maxPoints || points % CUSTOM_REFILL.step !== 0) {
      throw new BadRequestException(`Custom points must be ${CUSTOM_REFILL.minPoints}-${CUSTOM_REFILL.maxPoints} in steps of ${CUSTOM_REFILL.step}`);
    }
    const baseAmounts = REFILL_PACKS[0]!.amounts;
    return { packId: 'custom', points, amount: Math.ceil((points * baseAmounts[currency]) / CUSTOM_REFILL.basePoints) };
  }
  const pack = REFILL_PACKS.find((candidate) => candidate.id === packId);
  if (!pack) throw new BadRequestException('Unknown point pack');
  return { packId: pack.id, points: pack.points, amount: pack.amounts[currency] };
}

type RazorpayPayment = { id: string; order_id: string; amount: number | string; currency: string; status: string; captured: boolean };
const CAPTURE_RETRY_DELAYS_MS = [0, 400, 800, 1200] as const;

export function verifyRazorpaySignature(payload: string | Buffer, secret: string, received: string) {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(received, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class RazorpayService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly platformDb: PlatformDb,
    private readonly wallet: WalletService,
  ) {}

  private credentials() {
    const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = this.config;
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Point refills are not configured');
    return { keyId, keySecret };
  }

  protected client() {
    const { keyId, keySecret } = this.credentials();
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  private throwRazorpayError(error: unknown): never {
    const details = error as { statusCode?: number; status_code?: number; error?: { description?: string }; message?: string };
    const status = details.statusCode ?? details.status_code;
    const message = details.error?.description ?? details.message ?? 'Razorpay request failed';
    if (status === 401) throw new UnauthorizedException('Razorpay credentials were rejected');
    throw new InternalServerErrorException(message);
  }

  packs() {
    const keyId = this.config.RAZORPAY_KEY_ID;
    return {
      enabled: Boolean(keyId && this.config.RAZORPAY_KEY_SECRET),
      keyId: keyId ?? null,
      testMode: keyId?.startsWith('rzp_test_') ?? false,
      defaultCurrency: 'INR' as RefillCurrency,
      currencies: REFILL_CURRENCIES,
      packs: REFILL_PACKS,
      custom: { ...CUSTOM_REFILL, baseAmounts: REFILL_PACKS[0]!.amounts },
    };
  }

  async createOrder(platformSupplierId: string, packId: string, currency: RefillCurrency, customPoints?: number) {
    const purchase = resolveRefillPurchase(packId, currency, customPoints);
    const { amount } = purchase;
    if (!Number.isInteger(amount) || amount < 100) throw new BadRequestException('Payment amount must be at least 100 subunits');
    const id = randomUUID();
    let order;
    try {
      order = await this.client().orders.create({
        amount,
        currency,
        receipt: `refill_${id.replaceAll('-', '').slice(0, 25)}`,
        notes: { refill_id: id, supplier_id: platformSupplierId, pack_id: purchase.packId, points: purchase.points },
      });
    } catch (error) {
      this.throwRazorpayError(error);
    }
    if (Number(order.amount) !== amount || order.currency !== currency) {
      throw new ServiceUnavailableException('Razorpay returned an invalid order');
    }
    await this.platformDb.run((tx) =>
      tx.insert(walletRefillOrders).values({
        id,
        platformSupplierId,
        packId: purchase.packId,
        points: purchase.points,
        amountPaise: amount,
        currency,
        razorpayOrderId: order.id,
      }),
    );
    return { orderId: order.id, amount, currency, points: purchase.points };
  }

  async confirm(platformSupplierId: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
    const { keySecret } = this.credentials();
    const [order] = await this.platformDb.run((tx) =>
      tx.select().from(walletRefillOrders).where(and(
        eq(walletRefillOrders.razorpayOrderId, razorpayOrderId),
        eq(walletRefillOrders.platformSupplierId, platformSupplierId),
      )),
    );
    if (!order) throw new BadRequestException('Refill order was not found');
    if (!verifyRazorpaySignature(`${order.razorpayOrderId}|${razorpayPaymentId}`, keySecret, razorpaySignature)) {
      throw new BadRequestException('Invalid payment signature');
    }
    let payment: RazorpayPayment | undefined;
    for (const delayMs of CAPTURE_RETRY_DELAYS_MS) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        payment = await this.client().payments.fetch(razorpayPaymentId);
      } catch (error) {
        this.throwRazorpayError(error);
      }
      if (payment.captured || payment.status !== 'authorized') break;
    }
    if (!payment) throw new ServiceUnavailableException('Could not retrieve the Razorpay payment');
    return this.creditCapturedPayment(order.razorpayOrderId, payment);
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined, event: unknown) {
    const secret = this.config.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Razorpay webhook is not configured');
    if (!signature || !verifyRazorpaySignature(rawBody, secret, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const payload = event as { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } };
    if (payload.event !== 'payment.captured') return { accepted: true };
    const payment = payload.payload?.payment?.entity;
    if (!payment?.order_id) throw new BadRequestException('Webhook payment is missing its order');
    await this.creditCapturedPayment(payment.order_id, payment, true);
    return { accepted: true };
  }

  private async creditCapturedPayment(razorpayOrderId: string, payment: RazorpayPayment, ignoreUnknownOrder = false) {
    if (!payment.captured || payment.status !== 'captured') throw new BadRequestException('Payment has not been captured');
    return this.platformDb.run(async (tx) => {
      const [order] = await tx.select().from(walletRefillOrders)
        .where(eq(walletRefillOrders.razorpayOrderId, razorpayOrderId)).for('update');
      if (!order) {
        if (ignoreUnknownOrder) return null;
        throw new BadRequestException('Refill order was not found');
      }
      if (payment.order_id !== order.razorpayOrderId || Number(payment.amount) !== order.amountPaise || payment.currency !== order.currency) {
        throw new BadRequestException('Payment does not match the refill order');
      }
      if (order.creditedAt) {
        const balance = await this.wallet.balance(tx, order.platformSupplierId);
        return { walletBalance: balance, pointsAdded: 0, alreadyCredited: true };
      }
      await tx.update(walletRefillOrders).set({
        razorpayPaymentId: payment.id,
        status: 'paid',
        creditedAt: new Date(),
      }).where(eq(walletRefillOrders.id, order.id));
      const balance = await this.wallet.credit(tx, order.platformSupplierId, order.points, 'razorpay_refill', order.id);
      return { walletBalance: balance, pointsAdded: order.points, alreadyCredited: false };
    });
  }
}
