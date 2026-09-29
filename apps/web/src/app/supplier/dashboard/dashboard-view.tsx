'use client';

import { useMemo, useState } from 'react';
import { Building2Icon, MailIcon, MapPinIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { OpenLineForSupplier, SupplierBidActivity } from '@/lib/types';
import { BidForm } from './bid-form';

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

function matches(needle: string, ...haystack: (string | null | undefined)[]) {
  if (!needle) return true;
  const n = needle.trim().toLowerCase();
  return haystack.some((h) => h?.toLowerCase().includes(n));
}

export function DashboardView({ lines, bids }: { lines: OpenLineForSupplier[]; bids: SupplierBidActivity[] }) {
  const [oppQuery, setOppQuery] = useState('');
  const [oppFilter, setOppFilter] = useState<(typeof OPPORTUNITY_FILTERS)[number]['value']>('all');
  const [bidQuery, setBidQuery] = useState('');
  const [bidFilter, setBidFilter] = useState<(typeof BID_FILTERS)[number]['value']>('all');

  const filteredLines = useMemo(
    () =>
      lines.filter(
        (line) =>
          matches(oppQuery, line.itemCode, line.description) &&
          (oppFilter === 'all' || (oppFilter === 'bid' ? line.alreadyBid : !line.alreadyBid)),
      ),
    [lines, oppQuery, oppFilter],
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

  return (
    <Tabs defaultValue="opportunities">
      <TabsList><TabsTrigger value="opportunities">Opportunities ({lines.length})</TabsTrigger><TabsTrigger value="bids">My bids ({bids.length})</TabsTrigger></TabsList>

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
          <Building2Icon className="size-4 shrink-0" />
          You’ll see the buyer company details after they accept your bid.
        </p>

        {filteredLines.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{lines.length === 0 ? 'No open opportunities matched to you yet. Check back soon.' : 'No opportunities match your search.'}</CardContent></Card>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredLines.map((line) => (
            <Card key={line.sourcingLineId} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    {line.itemCode && <Badge variant="outline" className="font-mono">{line.itemCode}</Badge>}
                    <CardTitle>{line.description}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{line.qty} {line.uom}</span>
                      <span>·</span>
                      <span>{line.needBy ? `Needed by ${new Date(line.needBy).toLocaleDateString()}` : 'Flexible date'}</span>
                    </div>
                  </div>
                  <Badge variant={line.alreadyBid ? 'secondary' : 'outline'}>{line.alreadyBid ? 'Bid submitted' : 'Open'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-4">
                <div><div className="text-xs text-muted-foreground">Current unit price</div><div className="mt-1 text-lg font-semibold">{line.myUnitPrice ?? 'Not submitted'}</div></div>
                <BidForm line={line} />
              </CardContent>
            </Card>
          ))}
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
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{bids.length === 0 ? 'You have not submitted any bids yet.' : 'No bids match your search.'}</CardContent></Card>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredBids.map((bid) => (
            <Card key={bid.bidId} className="overflow-hidden">
              <CardHeader>
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
                  <div className="rounded-lg border bg-secondary/50 p-4">
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
  );
}
