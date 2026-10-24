'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRightIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, InboxIcon, MapPinIcon, SearchIcon, SendIcon, UsersIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SourcingListLine, SourcingRequestListEntry } from '@/lib/types';
import { DeleteSourcingRequestButton } from './delete-button';

type ItemRow = SourcingListLine & {
  requestTitle: string;
};

type StatusFilter = 'all' | 'open' | 'awarded' | 'closed';
const PAGE_SIZE = 25;

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function EmptyItems({ hasItems }: { hasItems: boolean }) {
  return (
    <Empty className="min-h-52 rounded-none border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
        <EmptyTitle>{hasItems ? 'No matching items' : 'No sourcing requests yet'}</EmptyTitle>
        <EmptyDescription>{hasItems ? 'Try changing your search or status filter.' : 'Create a request to begin finding suppliers.'}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function SourcingListTable({ requests }: { requests: SourcingRequestListEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [requestId, setRequestId] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const items = useMemo<ItemRow[]>(
    () => requests.flatMap((request) => request.lines.map((line) => ({ ...line, requestTitle: request.title }))),
    [requests],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesRequest = requestId === 'all' || item.sourcingRequestId === requestId;
      const matchesStatus = status === 'all' || item.status === status;
      const haystack = `${item.description} ${item.itemCode ?? ''} ${item.brandManufacturer ?? ''} ${item.hsnMfgCode ?? ''} ${item.requestTitle} ${item.deliveryCity} ${item.deliveryState}`.toLowerCase();
      return matchesRequest && matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [items, query, requestId, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstVisible = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, filtered.length);

  function openItem(item: ItemRow) {
    router.push(`/sourcing/${item.sourcingRequestId}?line=${item.id}`);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{filtered.length} of {items.length} items across {requests.length} requests</p>
        <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_minmax(12rem,16rem)_9rem]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search requested items" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search items" className="pl-8" />
          </div>
          <Select value={requestId} onValueChange={(value) => { setRequestId(String(value)); setPage(1); }}>
            <SelectTrigger aria-label="Filter by request"><span className="truncate">{requestId === 'all' ? 'All requests' : requests.find((request) => request.id === requestId)?.title ?? 'All requests'}</span></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">All requests</SelectItem>{requests.map((request) => <SelectItem key={request.id} value={request.id}>{request.title}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => { setStatus(value as StatusFilter); setPage(1); }}>
            <SelectTrigger aria-label="Filter by status"><span>{status === 'all' ? 'All statuses' : titleCase(status)}</span></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="awarded">Awarded</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectGroup></SelectContent>
          </Select>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg border bg-background md:block">
        <Table>
          <TableHeader><TableRow><TableHead className="px-4">Item</TableHead><TableHead>Quantity</TableHead><TableHead>Status</TableHead><TableHead>Activity</TableHead><TableHead>Need by</TableHead><TableHead className="px-4 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {visible.map((item) => (
              <TableRow key={item.id} className="group cursor-pointer" tabIndex={0} onClick={() => openItem(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openItem(item); }}>
                <TableCell className="min-w-72 px-4 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{item.description}</p><p className="mt-1 truncate text-xs text-muted-foreground">{[item.itemCode, item.brandManufacturer, item.requestTitle].filter(Boolean).join(' · ')}</p></div><ArrowUpRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></div></TableCell>
                <TableCell><p className="font-medium">{item.qty} {item.uom}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPinIcon className="size-3" />{item.deliveryCity}, {item.deliveryState}</p></TableCell>
                <TableCell><Badge variant={item.status === 'awarded' ? 'default' : 'secondary'}>{titleCase(item.status)}</Badge></TableCell>
                <TableCell><div className="flex items-center gap-3"><span className="flex items-center gap-1 text-sm"><UsersIcon className="size-3.5 text-muted-foreground" />{item.notifiedCount}</span><span className="flex items-center gap-1 text-sm"><SendIcon className="size-3.5 text-muted-foreground" />{item.bidCount}</span></div></TableCell>
                <TableCell className="text-muted-foreground"><span className="flex items-center gap-1.5"><CalendarDaysIcon className="size-3.5" />{item.needBy ? new Date(item.needBy).toLocaleDateString() : 'Not set'}</span></TableCell>
                <TableCell className="px-4 text-right" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><DeleteSourcingRequestButton id={item.sourcingRequestId} title={item.requestTitle} /></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="p-0"><EmptyItems hasItems={items.length > 0} /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <div className="overflow-hidden rounded-lg border md:hidden">
        {visible.map((item) => (
          <div key={item.id} role="button" tabIndex={0} className="border-b p-4 last:border-b-0" onClick={() => openItem(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openItem(item); }}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{item.description}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.requestTitle}</p></div><Badge variant={item.status === 'awarded' ? 'default' : 'secondary'}>{titleCase(item.status)}</Badge></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><span>{item.qty} {item.uom}</span><span className="flex items-center justify-end gap-1 text-muted-foreground"><UsersIcon className="size-3.5" />{item.notifiedCount}<SendIcon className="ml-2 size-3.5" />{item.bidCount}</span><span className="col-span-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPinIcon className="size-3" />{item.deliveryCity}, {item.deliveryState}</span></div>
            <div className="mt-3 flex justify-end border-t pt-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><DeleteSourcingRequestButton id={item.sourcingRequestId} title={item.requestTitle} /></div>
          </div>
        ))}
        {filtered.length === 0 && <EmptyItems hasItems={items.length > 0} />}
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">Showing {firstVisible}-{lastVisible} of {filtered.length}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeftIcon /></Button>
            <span className="min-w-20 text-center text-xs text-muted-foreground">Page {currentPage} of {pageCount}</span>
            <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRightIcon /></Button>
          </div>
        </div>
      )}
    </section>
  );
}
