import { api } from '@/lib/api';
import type { SourcingRequestDetail } from '@/lib/types';

export default async function SourcingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await api<SourcingRequestDetail>(`/sourcing-requests/${id}`);

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{request.title}</h1>
        <p className="text-sm text-muted">
          {request.source === 'bom_upload' ? 'Uploaded BOM' : 'Manual entry'} · {request.status} · {new Date(request.createdAt).toLocaleString()}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 font-medium">Qty</th>
              <th className="px-4 py-2.5 font-medium">Delivery</th>
              <th className="px-4 py-2.5 font-medium">Need by</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Suppliers notified</th>
            </tr>
          </thead>
          <tbody>
            {request.lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  {line.description}
                  {line.itemCode && <span className="ml-1 font-mono text-xs text-muted">({line.itemCode})</span>}
                </td>
                <td className="px-4 py-2.5">
                  {line.qty} {line.uom}
                </td>
                <td className="px-4 py-2.5 text-muted">{line.deliveryCity}, {line.deliveryState}</td>
                <td className="px-4 py-2.5 text-muted">{line.needBy ? new Date(line.needBy).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2.5">{line.status}</td>
                <td className="px-4 py-2.5">
                  {(line.notifiedCount ?? 0) > 0 ? (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{line.notifiedCount} notified</span>
                  ) : (
                    <span className="text-xs text-muted">none matched yet</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Suppliers see item details but never your company name until you accept one of their bids.
      </p>
    </div>
  );
}
