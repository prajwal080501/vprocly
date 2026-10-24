import { CheckCircle2Icon, MapPinIcon, WalletCardsIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { IconTile } from '@/components/icon-tile';
import { MotionReveal } from '@/components/motion-reveal';
import { supplierApi } from '@/lib/supplier-api';
import type { Category, ItemClarificationMessage, OpenLineForSupplier, RefillPacks, SupplierBidActivity, SupplierMe, SupplierNetworkInsights as SupplierNetworkInsightsType, SupplierPassport as SupplierPassportType } from '@/lib/types';
import { DashboardView } from './dashboard-view';
import { RefillPoints } from './refill-points';
import { SupplierPassport } from './supplier-passport';
import { SupplierNetworkInsights } from './supplier-network-insights';

export default async function SupplierDashboardPage() {
  const [me, lines, bids, refillConfig, passport, categories, network, clarifications] = await Promise.all([
    supplierApi<SupplierMe>('/supplier/me'),
    supplierApi<OpenLineForSupplier[]>('/supplier/lines'),
    supplierApi<SupplierBidActivity[]>('/supplier/bids'),
    supplierApi<RefillPacks>('/supplier/wallet/refill-packs'),
    supplierApi<SupplierPassportType>('/supplier/passport'),
    supplierApi<Category[]>('/categories'),
    supplierApi<SupplierNetworkInsightsType>('/supplier/network-insights'),
    supplierApi<ItemClarificationMessage[]>('/supplier/clarifications'),
  ]);

  return (
    <div className="flex flex-col gap-7">
      <MotionReveal>
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="outline" className="mb-2"><CheckCircle2Icon data-icon="inline-start" />{me.verified ? 'Verified supplier' : 'Active supplier'}</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">{me.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><MapPinIcon className="size-4" />{me.city}, {me.state}</p>
          </div>
          <div className="flex min-w-56 items-center gap-3 rounded-lg border bg-background p-3">
            <IconTile tone="amber"><WalletCardsIcon strokeWidth={1.8} /></IconTile>
            <div className="min-w-0 flex-1"><div className="text-xs text-muted-foreground">Wallet balance</div><div className="text-lg font-semibold">{me.walletBalance} points</div></div>
            <RefillPoints config={refillConfig} supplier={me} />
          </div>
        </header>
      </MotionReveal>
      <SupplierPassport passport={passport} supplier={me} categories={categories} />
      <SupplierNetworkInsights insights={network} />
      <DashboardView lines={lines} bids={bids} clarifications={clarifications} />
    </div>
  );
}
