import { supplierApi } from '@/lib/supplier-api';
import type { OpenLineForSupplier, SupplierMe } from '@/lib/types';
import { BidForm } from './bid-form';

export default async function SupplierDashboardPage() {
  const [me, lines] = await Promise.all([
    supplierApi<SupplierMe>('/supplier/me'),
    supplierApi<OpenLineForSupplier[]>('/supplier/lines'),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{me.name}</h1>
          <p className="text-sm text-muted">{me.city}, {me.state}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-right">
          <div className="text-xs text-muted">Wallet balance</div>
          <div className="text-lg font-semibold">{me.walletBalance} points</div>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted">Open sourcing opportunities</h2>
      {lines.length === 0 && <p className="text-sm text-muted">No open opportunities matched to you yet — check back soon.</p>}
      <div className="space-y-3">
        {lines.map((line) => (
          <div key={line.sourcingLineId} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                {line.itemCode && <p className="font-mono text-xs text-muted">{line.itemCode}</p>}
                <p className="font-medium">{line.description}</p>
              </div>
              <p className="text-sm text-muted whitespace-nowrap">
                {line.qty} {line.uom}
                {line.needBy && ` · needed by ${new Date(line.needBy).toLocaleDateString()}`}
              </p>
            </div>
            <BidForm line={line} />
          </div>
        ))}
      </div>
    </div>
  );
}
