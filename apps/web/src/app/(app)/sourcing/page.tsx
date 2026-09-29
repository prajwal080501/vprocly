import { BoxesIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { Category, SourcingRequestListEntry } from '@/lib/types';
import { CreateSourcingDialog } from './create-sourcing-dialog';
import { SourcingListTable } from './sourcing-list-table';

export default async function SourcingListPage() {
  const [requests, categories] = await Promise.all([
    api<SourcingRequestListEntry[]>('/sourcing-requests'),
    api<Category[]>('/categories'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-card"><BoxesIcon className="size-5" /></div>
          <div><h1 className="text-2xl font-semibold tracking-tight">Sourcing requests</h1><p className="mt-1 text-sm text-muted-foreground">Create requests, match suppliers, and compare incoming bids.</p></div>
        </div>
        <CreateSourcingDialog categories={categories} />
      </header>
      <SourcingListTable requests={requests} />
    </div>
  );
}
