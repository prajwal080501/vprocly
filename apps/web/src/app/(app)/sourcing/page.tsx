import Link from 'next/link';
import { api } from '@/lib/api';
import type { SourcingRequestSummary } from '@/lib/types';
import { DeleteSourcingRequestButton } from './delete-button';

export default async function SourcingListPage() {
  const requests = await api<SourcingRequestSummary[]>('/sourcing-requests');

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sourcing requests</h1>
          <p className="text-sm text-muted">Post items and we&apos;ll find and invite suppliers to bid.</p>
        </div>
        <Link href="/sourcing/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
          + New sourcing request
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <Link href={`/sourcing/${r.id}`} className="font-medium hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted">{r.source === 'bom_upload' ? 'BOM upload' : 'Manual entry'}</td>
                <td className="px-4 py-2.5">{r.status}</td>
                <td className="px-4 py-2.5 text-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-2.5 text-right">
                  <DeleteSourcingRequestButton id={r.id} title={r.title} />
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No sourcing requests yet. <Link href="/sourcing/new" className="underline">Post your first one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
