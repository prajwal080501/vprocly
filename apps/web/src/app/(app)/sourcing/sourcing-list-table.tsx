'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRightIcon, CalendarDaysIcon, InboxIcon, Layers3Icon, MapPinIcon, SearchIcon, SendIcon, UsersIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyStateIcon } from '@/components/illustrations';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SourcingListLine, SourcingRequestListEntry } from '@/lib/types';
import { DeleteSourcingRequestButton } from './delete-button';

type ItemRow = SourcingListLine & {
  requestTitle: string;
  requestSource: SourcingRequestListEntry['source'];
  requestCreatedAt: string;
};

type GroupMode = 'none' | 'request' | 'status';
type StatusFilter = 'all' | 'open' | 'awarded' | 'closed';

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function ItemTableRow({ item }: { item: ItemRow }) {
  const router = useRouter();
  const href = `/sourcing/${item.sourcingRequestId}?line=${item.id}`;

  return (
    <TableRow
      className="group cursor-pointer"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') router.push(href);
      }}
    >
      <TableCell className="min-w-64 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Layers3Icon className="size-4" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><p className="truncate font-medium">{item.description}</p><ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{[item.itemCode, item.brandManufacturer, item.hsnMfgCode, item.requestTitle].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      </TableCell>
      <TableCell><p className="font-medium">{item.qty} {item.uom}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPinIcon className="size-3" />{item.deliveryCity}, {item.deliveryState}</p></TableCell>
      <TableCell><Badge variant={item.status === 'awarded' ? 'default' : 'secondary'}>{titleCase(item.status)}</Badge></TableCell>
      <TableCell><div className="flex items-center gap-3"><span className="flex items-center gap-1 text-sm"><UsersIcon className="size-3.5 text-muted-foreground" />{item.notifiedCount}</span><span className="flex items-center gap-1 text-sm"><SendIcon className="size-3.5 text-muted-foreground" />{item.bidCount}</span></div></TableCell>
      <TableCell className="text-muted-foreground"><div className="flex items-center gap-1.5"><CalendarDaysIcon className="size-3.5" />{item.needBy ? new Date(item.needBy).toLocaleDateString() : 'Not set'}</div></TableCell>
      <TableCell className="px-4 text-right" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><DeleteSourcingRequestButton id={item.sourcingRequestId} title={item.requestTitle} /></TableCell>
    </TableRow>
  );
}

export function SourcingListTable({ requests }: { requests: SourcingRequestListEntry[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupMode>('request');
  const items = useMemo<ItemRow[]>(() => requests.flatMap((request) => request.lines.map((line) => ({ ...line, requestTitle: request.title, requestSource: request.source, requestCreatedAt: request.createdAt }))), [requests]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = status === 'all' || item.status === status;
      const haystack = `${item.description} ${item.itemCode ?? ''} ${item.brandManufacturer ?? ''} ${item.hsnMfgCode ?? ''} ${item.requestTitle} ${item.deliveryCity} ${item.deliveryState}`.toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [items, query, status]);
  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', items: filtered }];
    const grouped = new Map<string, ItemRow[]>();
    for (const item of filtered) {
      const key = groupBy === 'request' ? item.sourcingRequestId : item.status;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return [...grouped.entries()].map(([key, rows]) => ({ key, label: groupBy === 'request' ? rows[0]!.requestTitle : titleCase(key), items: rows }));
  }, [filtered, groupBy]);

  return (
    <Card className="rounded-lg border bg-background shadow-none ring-0">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><CardTitle>All requested items</CardTitle><CardDescription>{filtered.length} of {items.length} items across {requests.length} requests</CardDescription></div>
          <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_9rem_10rem]">
            <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items or requests" className="bg-background pl-8" /></div>
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}><SelectTrigger className="bg-background" aria-label="Filter by status"><span className="truncate">{status === 'all' ? 'All statuses' : titleCase(status)}</span></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="awarded">Awarded</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectGroup></SelectContent></Select>
            <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupMode)}><SelectTrigger className="bg-background" aria-label="Group items"><span className="truncate">{groupBy === 'request' ? 'Group by request' : groupBy === 'status' ? 'Group by status' : 'No grouping'}</span></SelectTrigger><SelectContent><SelectGroup><SelectItem value="request">Group by request</SelectItem><SelectItem value="status">Group by status</SelectItem><SelectItem value="none">No grouping</SelectItem></SelectGroup></SelectContent></Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0"><Table>
        <TableHeader><TableRow><TableHead className="px-4">Item</TableHead><TableHead>Quantity & delivery</TableHead><TableHead>Status</TableHead><TableHead>Notified / bids</TableHead><TableHead>Need by</TableHead><TableHead className="px-4 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>
          {groups.flatMap((group) => [
            ...(group.label ? [<TableRow key={`${group.key}-heading`} className="bg-muted/40 hover:bg-muted/40"><TableCell colSpan={6} className="px-4 py-2 text-xs font-medium text-muted-foreground">{group.label} · {group.items.length} {group.items.length === 1 ? 'item' : 'items'}</TableCell></TableRow>] : []),
            ...group.items.map((item) => <ItemTableRow key={item.id} item={item} />),
          ])}
          {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="h-48 text-center"><div className="flex flex-col items-center gap-2"><EmptyStateIcon icon={InboxIcon} /><p className="text-sm text-muted-foreground">{items.length ? 'No items match these filters.' : 'No requested items yet.'}</p></div></TableCell></TableRow>}
        </TableBody>
      </Table></CardContent>
    </Card>
  );
}
