'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, CircleAlertIcon, CoinsIcon, LoaderCircleIcon, LocateFixedIcon, MapPinIcon, PlusIcon, ShieldCheckIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DetectedLocation, RefillCurrency, RefillPack, RefillPacks, SupplierMe } from '@/lib/types';
import { cn } from '@/lib/utils';
import { confirmRefillPayment, createRefillOrder, detectCheckoutLocation } from './actions';

type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayFailure = { error?: { code?: string; description?: string; reason?: string; source?: string; step?: string } };
type RazorpayCheckout = { open(): void; on(event: 'payment.failed', callback: (error: RazorpayFailure) => void): void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

let checkoutScript: Promise<void> | null = null;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load secure checkout'));
    document.head.appendChild(script);
  });
  return checkoutScript;
}

function formatPrice(amount: number, currency: RefillCurrency) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount / 100);
}

export function RefillPoints({ config, supplier }: { config: RefillPacks; supplier: SupplierMe }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(config.packs[1]?.id ?? config.packs[0]?.id ?? '');
  const [customPoints, setCustomPoints] = useState(config.custom.defaultPoints);
  const [currency, setCurrency] = useState<RefillCurrency>(config.defaultCurrency);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [location, setLocation] = useState<DetectedLocation | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'detecting' | 'done' | 'unavailable'>('idle');
  const customValid = Number.isInteger(customPoints)
    && customPoints >= config.custom.minPoints
    && customPoints <= config.custom.maxPoints
    && customPoints % config.custom.step === 0;

  useEffect(() => {
    if (!open || locationState !== 'idle') return;
    if (!navigator.geolocation) {
      setLocationState('unavailable');
      return;
    }
    setLocationState('detecting');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const result = await detectCheckoutLocation(coords.latitude, coords.longitude);
        if ('error' in result) {
          setLocationState('unavailable');
          return;
        }
        setLocation(result.data);
        setCurrency(result.data.suggestedCurrency);
        setLocationState('done');
      },
      () => setLocationState('unavailable'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 15 * 60 * 1000 },
    );
  }, [open, locationState]);

  async function beginPayment() {
    const pack = config.packs.find((candidate) => candidate.id === selected);
    if ((!pack && selected !== 'custom') || !config.keyId) return;
    setBusy(true);
    setMessage(null);
    try {
      await loadCheckout();
      const orderResult = await createRefillOrder(selected, currency, selected === 'custom' ? customPoints : undefined);
      if ('error' in orderResult) throw new Error(orderResult.error);
      const order = orderResult.data;
      if (!window.Razorpay) throw new Error('Secure checkout is unavailable');
      const checkout = new window.Razorpay({
        key: config.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'vProcly',
        description: `${order.points.toLocaleString('en-IN')} supplier points`,
        image: `${window.location.origin}/brand-mark.svg`,
        order_id: order.orderId,
        prefill: { name: supplier.name, email: supplier.email, contact: supplier.phone ?? undefined },
        theme: { color: '#1473e6' },
        modal: {
          ondismiss: () => {
            setMessage('Checkout cancelled. No points were added.');
            setBusy(false);
          },
        },
        handler: async (result: RazorpayResult) => {
          try {
            const confirmation = await confirmRefillPayment({
              razorpayOrderId: result.razorpay_order_id,
              razorpayPaymentId: result.razorpay_payment_id,
              razorpaySignature: result.razorpay_signature,
            });
            if ('error' in confirmation) throw new Error(confirmation.error);
            setMessage(`${confirmation.data.walletBalance.toLocaleString('en-IN')} points available`);
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not verify the payment. No points were added.');
          } finally {
            setBusy(false);
          }
        },
      });
      checkout.on('payment.failed', (failure) => {
        const description = failure.error?.description;
        const isUpiError = /upi|vpa/i.test(`${description ?? ''} ${failure.error?.reason ?? ''}`);
        setMessage(config.testMode && isUpiError
          ? 'This checkout only offers UPI QR/Intent, which cannot be completed with a real UPI app in Test Mode. Use the test card or Netbanking instead.'
          : description ?? 'Payment failed. No points were added.');
        setBusy(false);
      });
      checkout.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start payment');
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" disabled={!config.enabled} />}>
        <PlusIcon data-icon="inline-start" />
        Refill
      </DialogTrigger>
      <DialogContent className="max-h-[min(46rem,calc(100dvh-2rem))] !w-[min(42rem,calc(100vw-2rem))] !max-w-none gap-0 overflow-hidden p-0 sm:!max-w-none">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>Refill supplier points</DialogTitle>
          <DialogDescription>Your 1,000 signup points are complimentary. Refills below are paid once through Razorpay.</DialogDescription>
        </DialogHeader>
        <div className="dialog-scroll-region flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
        <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {locationState === 'detecting' ? <LoaderCircleIcon className="size-4 shrink-0 animate-spin" /> : <MapPinIcon className="size-4 shrink-0" />}
            <span className="truncate">
              {locationState === 'detecting' && 'Detecting location for local currency'}
              {locationState === 'done' && location?.formattedAddress}
              {locationState === 'unavailable' && 'Location unavailable. Choose a currency.'}
              {locationState === 'idle' && 'Location detection starts when opened'}
            </span>
          </div>
          <Select value={currency} onValueChange={(value) => setCurrency(value as RefillCurrency)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>{config.currencies.map((option) => <SelectItem key={option.code} value={option.code}>{option.code} - {option.label}</SelectItem>)}</SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" role="radiogroup" aria-label="Point pack">
          {config.packs.map((pack: RefillPack) => {
            const active = pack.id === selected;
            return (
              <button
                key={pack.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={cn(
                  'relative flex min-h-24 min-w-0 flex-col items-start justify-between rounded-lg border p-3 text-left transition-all hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                  active && 'border-primary bg-primary/5 shadow-sm',
                )}
                onClick={() => setSelected(pack.id)}
              >
                {active && <CheckIcon className="absolute right-3 top-3 size-4 text-primary" />}
                <CoinsIcon className="size-5 text-muted-foreground" />
                <span><span className="block font-semibold">{pack.points.toLocaleString('en-IN')} points</span><span className="text-xs text-muted-foreground">{formatPrice(pack.amounts[currency], currency)}</span></span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={selected === 'custom'}
            className={cn(
              'relative flex min-h-24 min-w-0 flex-col items-start justify-between rounded-lg border p-3 text-left transition-all hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
              selected === 'custom' && 'border-primary bg-primary/5 shadow-sm',
            )}
            onClick={() => setSelected('custom')}
          >
            {selected === 'custom' && <CheckIcon className="absolute right-3 top-3 size-4 text-primary" />}
            <PlusIcon className="size-5 text-muted-foreground" />
            <span>
              <span className="block font-semibold">Custom refill</span>
              <span className="text-xs text-muted-foreground">
                {formatPrice(Math.ceil((customPoints * config.custom.baseAmounts[currency]) / config.custom.basePoints), currency)}
              </span>
            </span>
          </button>
        </div>
        {selected === 'custom' && (
          <Field data-invalid={!customValid}>
            <FieldLabel htmlFor="custom-refill-points">Points to add</FieldLabel>
            <Input
              id="custom-refill-points"
              type="number"
              inputMode="numeric"
              min={config.custom.minPoints}
              max={config.custom.maxPoints}
              step={config.custom.step}
              value={customPoints}
              aria-invalid={!customValid}
              onChange={(event) => setCustomPoints(Number(event.target.value))}
            />
            <FieldDescription>
              {config.custom.minPoints.toLocaleString('en-IN')} to {config.custom.maxPoints.toLocaleString('en-IN')} points, in steps of {config.custom.step}.
            </FieldDescription>
            {!customValid && <FieldError>Enter a valid point quantity.</FieldError>}
          </Field>
        )}
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><LocateFixedIcon className="size-4" />Location is used only to suggest currency. You can change it before paying.</p>
        {config.testMode && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">Razorpay Test Mode.</span> Choose Cards and use Visa <code className="font-semibold">4100 2800 0000 1007</code>, any future expiry, and any CVV. You can also choose Netbanking and select success on its mock bank page. UPI QR works with real apps only in Live Mode.
            </p>
          </div>
        )}
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheckIcon className="size-4" />Payment details are handled securely by Razorpay.</p>
        {message && <p className="text-sm font-medium" role="status">{message}</p>}
        </div>
        <DialogFooter className="!m-0 !rounded-none px-5 py-4">
          <Button onClick={beginPayment} disabled={busy || !selected || !config.enabled || (selected === 'custom' && !customValid)}>
            {busy ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <ShieldCheckIcon data-icon="inline-start" />}
            {busy ? 'Opening checkout' : 'Pay securely'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
