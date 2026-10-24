import { api } from '@/lib/api';
import type { Category, SourcingRequestListEntry } from '@/lib/types';
import { CreateSourcingDialog } from './create-sourcing-dialog';
import { SourcingListTable } from './sourcing-list-table';

export default async function SourcingListPage() {
  const [requests, categories] = await Promise.all([
    api<SourcingRequestListEntry[]>('/sourcing-requests'),
    api<Category[]>('/categories'),
  ]);
  const customRequests = requests
    .filter((request) => request.source === 'manual' && request.status === 'open')
    .map((request) => ({ id: request.id, title: request.title, lineCount: request.lines.length }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="page-heading">Sourcing requests</h1><p className="page-description">Track requested items, supplier outreach, and bids.</p></div>
        <CreateSourcingDialog categories={categories} customRequests={customRequests} />
      </header>
      <SourcingListTable requests={requests} />
    </div>
  );
}
