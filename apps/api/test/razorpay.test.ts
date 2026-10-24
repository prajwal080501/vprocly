import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import Razorpay from 'razorpay';
import type { AppConfig } from '../src/config.js';
import type { PlatformDb } from '../src/platform/platform-db.service.js';
import { RazorpayService, REFILL_PACKS, resolveRefillPurchase, verifyRazorpaySignature } from '../src/modules/marketplace-suppliers/razorpay.service.js';
import type { WalletService } from '../src/modules/marketplace-suppliers/wallet.service.js';
import { currencyForCountry } from '../src/modules/marketplace-suppliers/location.service.js';

describe('Razorpay point refills', () => {
  it('offers only positive, fixed multi-currency point packs', () => {
    expect(REFILL_PACKS).toHaveLength(3);
    for (const pack of REFILL_PACKS) {
      expect(pack.points).toBeGreaterThan(0);
      for (const amount of Object.values(pack.amounts)) expect(amount).toBeGreaterThanOrEqual(100);
    }
  });

  it('maps detected countries to a supported checkout currency', () => {
    expect(currencyForCountry('IN')).toBe('INR');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('AE')).toBe('AED');
    expect(currencyForCountry('SG')).toBe('SGD');
    expect(currencyForCountry('CA')).toBe('USD');
  });

  it('prices custom refills from server-owned rates and validates the quantity', () => {
    expect(resolveRefillPurchase('custom', 'INR', 50)).toEqual({ packId: 'custom', points: 50, amount: 4950 });
    expect(resolveRefillPurchase('custom', 'INR', 250)).toEqual({ packId: 'custom', points: 250, amount: 24750 });
    expect(resolveRefillPurchase('custom', 'USD', 250)).toEqual({ packId: 'custom', points: 250, amount: 498 });
    expect(() => resolveRefillPurchase('custom', 'INR', 125)).toThrow('steps of 50');
    expect(() => resolveRefillPurchase('custom', 'INR', 10_050)).toThrow('50-10000');
  });

  it('accepts an authentic checkout signature and rejects tampering', () => {
    const secret = 'test_razorpay_secret';
    const payload = 'order_123|pay_456';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyRazorpaySignature(payload, secret, signature)).toBe(true);
    expect(verifyRazorpaySignature('order_123|pay_changed', secret, signature)).toBe(false);
    expect(verifyRazorpaySignature(payload, secret, 'too-short')).toBe(false);
  });

  it('validates webhook signatures against the exact raw bytes', () => {
    const secret = 'webhook_secret_123';
    const raw = Buffer.from('{"event":"payment.captured","payload":{}}');
    const signature = createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifyRazorpaySignature(raw, secret, signature)).toBe(true);
    expect(verifyRazorpaySignature(Buffer.from(`${raw.toString()} `), secret, signature)).toBe(false);
  });

  it('credits a captured payment exactly once when confirmation is retried', async () => {
    const secret = 'test_razorpay_secret';
    const order = {
      id: 'a27a2e47-c7eb-49c8-9775-78bbc194bb29',
      platformSupplierId: '0f1b5a4d-1f86-45ae-b1d4-bfc28869dd4b',
      packId: 'starter',
      points: 100,
      amountPaise: 9900,
      currency: 'INR',
      razorpayOrderId: 'order_test_123',
      razorpayPaymentId: null as string | null,
      status: 'created',
      creditedAt: null as Date | null,
      createdAt: new Date(),
    };
    let balance = 1000;
    let creditCalls = 0;
    const selected = Object.assign(Promise.resolve([order]), { for: async () => [order] });
    const tx = {
      select: () => ({ from: () => ({ where: () => selected }) }),
      update: () => ({ set: (values: Partial<typeof order>) => ({ where: async () => { Object.assign(order, values); } }) }),
    };
    const platformDb = { run: (callback: (current: typeof tx) => unknown) => callback(tx) };
    const wallet = {
      balance: async () => balance,
      credit: async (_tx: unknown, _supplierId: string, points: number) => {
        creditCalls += 1;
        balance += points;
        return balance;
      },
    };
    const config = { RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: secret } as AppConfig;
    class TestRazorpayService extends RazorpayService {
      protected override client(): Razorpay {
        return {
          payments: { fetch: async () => ({
            id: 'pay_test_456', order_id: order.razorpayOrderId, amount: order.amountPaise,
            currency: order.currency, status: 'captured', captured: true,
          }) },
        } as unknown as Razorpay;
      }
    }
    const service = new TestRazorpayService(config, platformDb as unknown as PlatformDb, wallet as unknown as WalletService);
    const signature = createHmac('sha256', secret).update(`${order.razorpayOrderId}|pay_test_456`).digest('hex');

    const first = await service.confirm(order.platformSupplierId, order.razorpayOrderId, 'pay_test_456', signature);
    const repeated = await service.confirm(order.platformSupplierId, order.razorpayOrderId, 'pay_test_456', signature);

    expect(first).toEqual({ walletBalance: 1100, pointsAdded: 100, alreadyCredited: false });
    expect(repeated).toEqual({ walletBalance: 1100, pointsAdded: 0, alreadyCredited: true });
    expect(creditCalls).toBe(1);
  });
});
