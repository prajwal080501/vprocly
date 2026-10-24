'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, Building2Icon, GavelIcon, InboxIcon, LockKeyholeIcon, MailIcon, MapPinIcon, PackageIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/icon-tile';
import { ItemClarificationDialog } from '@/components/item-clarification-dialog';
import { MotionReveal } from '@/components/motion-reveal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ItemClarificationMessage, OpenLineForSupplier, SupplierBidActivity } from '@/lib/types';
import { BidForm } from './bid-form';
import { sendSupplierClarification, setSupplierCapability } from './actions';

const OPPORTUNITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Not yet bid' },
  { value: 'bid', label: 'Bid submitted' },
] as const;

const BID_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Not selected' },
  { value: 'withdrawn', label: 'Withdrawn' },
] as const;

type OpportunitySortKey = 'item' | 'quantity' | 'needBy' | 'status' | 'price';
type OpportunitySort = { key: OpportunitySortKey; direction: 'asc' | 'desc' };

function SortableHead({ label, column, sort, onSort, align = 'left' }: { label: string; column: OpportunitySortKey; sort: OpportunitySort; onSort: (column: OpportunitySortKey) => void; align?: 'left' | 'right' }) {
  const active = sort.key === column;
  const SortIcon = !active ? ArrowUpDownIcon : sort.direction === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={align === 'right' ? 'text-right' : undefined}>
      <Button variant="ghost" size="sm" className={align === 'right' ? '-mr-2 ml-auto' : '-ml-2'} onClick={() => onSort(column)}>
        {label}<SortIcon data-icon="inline-end" />
      </Button>
    </TableHead>
  );
}

function matches(needle: string, ...haystack: (string | null | undefined)[]) {
  if (!needle) return true;
  const n = needle.trim().toLowerCase();
  return haystack.some((h) => h?.toLowerCase().includes(n));
}

function CapabilitySelect({ line }: { line: OpenLineForSupplier }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div>
      <Select
        value={line.capabilityResponse?.status ?? ''}
        onValueChange={(value) => startTransition(async () => {
          setError(undefined);
          const result = await setSupplierCapability(line.sourcingLineId, value as 'can_supply' | 'needs_clarification' | 'declined');
          setError(result.error);
        })}
        disabled={pending}
      >
        <SelectTrigger className="mt-2 w-44"><SelectValue placeholder={pending ? 'Saving' : 'Respond'} /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="can_supply">Can supply</SelectItem>
            <SelectItem value="needs_clarification">Need clarification</SelectItem>
            <SelectItem value="declined">Cannot supply</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && <p className="mt-1 max-w-44 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function DashboardView({ lines, bids, clarifications }: { lines: OpenLineForSupplier[]; bids: SupplierBidActivity[]; clarifications: ItemClarificationMessage[] }) {
  const [oppQuery, setOppQuery] = useState('');
  const [oppFilter, setOppFilter] = useState<(typeof OPPORTUNITY_FILTERS)[number]['value']>('all');
  const [oppSort, setOppSort] = useState<OpportunitySort>({ key: 'needBy', direction: 'asc' });
  const [bidQuery, setBidQuery] = useState('');
  const [bidFilter, setBidFilter] = useState<(typeof BID_FILTERS)[number]['value']>('all');

  const filteredLines = useMemo(
    () =>
      lines.filter(
        (line) =>
          matches(oppQuery, line.itemCode, line.description) &&
          (oppFilter === 'all' || (oppFilter === 'bid' ? line.alreadyBid : !line.alreadyBid)),
      ).sort((left, right) => {
        let comparison = 0;
        if (oppSort.key === 'item') comparison = left.description.localeCompare(right.description);
        if (oppSort.key === 'quantity') comparison = Number(left.qty) - Number(right.qty);
        if (oppSort.key === 'status') comparison = Number(left.alreadyBid) - Number(right.alreadyBid);
        if (oppSort.key === 'price') comparison = Number(left.myUnitPrice ?? Number.POSITIVE_INFINITY) - Number(right.myUnitPrice ?? Number.POSITIVE_INFINITY);
        if (oppSort.key === 'needBy') {
          const leftDate = left.needBy ? new Date(left.needBy).getTime() : Number.POSITIVE_INFINITY;
          const rightDate = right.needBy ? new Date(right.needBy).getTime() : Number.POSITIVE_INFINITY;
          comparison = leftDate - rightDate;
        }
        return (oppSort.direction === 'asc' ? comparison : -comparison) || left.description.localeCompare(right.description);
      }),
    [lines, oppQuery, oppFilter, oppSort],
  );

  const filteredBids = useMemo(
    () =>
      bids.filter(
        (bid) =>
          matches(bidQuery, bid.itemCode, bid.description, bid.deliveryCity, bid.deliveryState) &&
          (bidFilter === 'all' || bid.status === bidFilter),
      ),
    [bids, bidQuery, bidFilter],
  );

  function changeOpportunitySort(key: OpportunitySortKey) {
    setOppSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  }

  return (
    <MotionReveal delay={0.15}>
    <Tabs defaultValue="opportunities">
      <TabsList><TabsTrigger value="opportunities"><InboxIcon data-icon="inline-start" />Matched RFQs ({lines.length})</TabsTrigger><TabsTrigger value="bids"><GavelIcon data-icon="inline-start" />My bids ({bids.length})</TabsTrigger></TabsList>

      <TabsContent value="opportunities" className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1"><SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={oppQuery} onChange={(e) => setOppQuery(e.target.value)} placeholder="Search item name or code" className="pl-8" /></div>
          <Select value={oppFilter} onValueChange={(v) => setOppFilter(v as typeof oppFilter)}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>{OPPORTUNITY_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconTile icon={LockKeyholeIcon} tone="neutral" className="size-7" />
          You’ll see the buyer company details after they accept your bid.
        </p>
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table className="min-w-[760px]">
            <TableHeader><TableRow><SortableHead label="Item" column="item" sort={oppSort} onSort={changeOpportunitySort} /><SortableHead label="Quantity" column="quantity" sort={oppSort} onSort={changeOpportunitySort} /><SortableHead label="Need by" column="needBy" sort={oppSort} onSort={changeOpportunitySort} /><SortableHead label="Status" column="status" sort={oppSort} onSort={changeOpportunitySort} /><SortableHead label="Your unit price" column="price" sort={oppSort} onSort={changeOpportunitySort} align="right" /><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredLines.map((line) => (
                <TableRow key={line.sourcingLineId}>
                  <TableCell className="min-w-64 whitespace-normal"><div className="flex items-start gap-3"><IconTile icon={PackageIcon} tone="cyan" className="size-8" /><div className="min-w-0"><p className="font-medium">{line.description}</p>{line.itemCode && <p className="mt-1 font-mono text-xs text-muted-foreground">{line.itemCode}</p>}</div></div></TableCell>
                  <TableCell className="font-medium">{line.qty} {line.uom}</TableCell>
                  <TableCell>{line.needBy ? new Date(line.needBy).toLocaleDateString() : <span className="text-muted-foreground">Flexible</span>}</TableCell>
                  <TableCell><Badge variant={line.alreadyBid ? 'secondary' : 'outline'}>{line.alreadyBid ? 'Bid submitted' : 'Awaiting bid'}</Badge><CapabilitySelect line={line} /></TableCell>
                  <TableCell className="text-right font-medium">{line.myUnitPrice ?? <span className="font-normal text-muted-foreground">Not submitted</span>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <ItemClarificationDialog
                        title={line.description}
                        description="Ask the buyer team about specifications, delivery, or commercial terms without leaving this RFQ."
                        messages={clarifications.filter((message) => message.sourcingLineId === line.sourcingLineId)}
                        currentParty="supplier"
                        sendAction={sendSupplierClarification.bind(null, line.sourcingLineId)}
                      />
                      <BidForm line={line} compact />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredLines.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{lines.length === 0 ? 'No matched RFQs are open right now.' : 'No RFQs match your search and filter.'}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="bids" className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1"><SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={bidQuery} onChange={(e) => setBidQuery(e.target.value)} placeholder="Search item name, code, or city" className="pl-8" /></div>
          <Select value={bidFilter} onValueChange={(v) => setBidFilter(v as typeof bidFilter)}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>{BID_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {filteredBids.length === 0 && (
          <div className="rounded-lg border bg-background py-10 text-center text-sm text-muted-foreground">{bids.length === 0 ? 'You have not submitted any bids yet.' : 'No bids match your search.'}</div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredBids.map((bid) => (
            <Card key={bid.bidId} className="overflow-hidden shadow-none">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    {bid.itemCode && <Badge variant="outline" className="font-mono">{bid.itemCode}</Badge>}
                    <CardTitle>{bid.description}</CardTitle>
                    <p className="text-sm text-muted-foreground">{bid.qty} {bid.uom} · Your quote {bid.unitPrice}</p>
                  </div>
                  <Badge variant={bid.status === 'accepted' ? 'default' : 'secondary'}>{bid.status === 'rejected' ? 'Not selected' : bid.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {bid.buyer ? (
                  <div className="border-l-2 border-primary bg-muted/30 p-4">
                    <div className="mb-3 flex items-center gap-2 font-medium"><Building2Icon className="size-4" />{bid.buyer.name}</div>
                    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-2"><MapPinIcon className="size-4" />{bid.deliveryCity}, {bid.deliveryState}</span>
                      {bid.buyer.contactEmail && <span className="flex items-center gap-2"><MailIcon className="size-4" />{bid.buyer.contactName ?? bid.buyer.contactEmail} · {bid.buyer.contactEmail}</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">You’ll see the buyer company details after they accept your bid.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>
    </Tabs>
    </MotionReveal>
  );
}
