import { CheckCircle2Icon, MapPinIcon, WalletCardsIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supplierApi } from '@/lib/supplier-api';
import type { OpenLineForSupplier, SupplierBidActivity, SupplierMe } from '@/lib/types';
import { DashboardView } from './dashboard-view';

export default async function SupplierDashboardPage() {
  const [me, lines, bids] = await Promise.all([
    supplierApi<SupplierMe>('/supplier/me'),
    supplierApi<OpenLineForSupplier[]>('/supplier/lines'),
    supplierApi<SupplierBidActivity[]>('/supplier/bids'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-2"><CheckCircle2Icon data-icon="inline-start" />Verified supplier</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">{me.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><MapPinIcon className="size-4" />{me.city}, {me.state}</p>
        </div>
        <Card className="min-w-56">
          <CardContent className="flex items-center gap-3 py-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary"><WalletCardsIcon className="size-4" /></span>
            <div><div className="text-xs text-muted-foreground">Wallet balance</div><div className="text-lg font-semibold">{me.walletBalance} points</div></div>
          </CardContent>
        </Card>
      </header>
      <DashboardView lines={lines} bids={bids} />
    </div>
  );
}
