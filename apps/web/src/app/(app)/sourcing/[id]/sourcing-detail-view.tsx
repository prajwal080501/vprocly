'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  Building2Icon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  Clock3Icon,
  FileTextIcon,
  HashIcon,
  HistoryIcon,
  LoaderCircleIcon,
  MailCheckIcon,
  MapPinIcon,
  PackageIcon,
  PhoneCallIcon,
  ShieldCheckIcon,
  SendIcon,
  TimerIcon,
  TrendingDownIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ItemClarificationDialog } from '@/components/item-clarification-dialog';
import { SupplierResearchAnimation } from '@/components/supplier-research-animation';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ItemClarificationMessage, PriceIntelligence, SourcingBid, SourcingLine, SourcingRequestDetail, SupplierResearchNotification, SupplierScore } from '@/lib/types';
import { AcceptBidButton } from './accept-bid-button';
import { InviteLinePopover } from './invite-line-popover';
import { ManualOutreachButtons } from './manual-outreach-buttons';
import { RetryResearchButton } from './retry-research-button';
import { sendBuyerClarification } from './actions';

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function supplierLocation(supplier: SupplierResearchNotification) {
  return [supplier.supplierCity, supplier.supplierState].filter(Boolean).join(', ') || 'Location pending';
}

function supplierCallLabel(supplier: SupplierResearchNotification) {
  const status = supplier.voiceCall?.status;
  if (!supplier.supplierPhone) return 'No phone';
  if (!status || status === 'queued') return 'Call queued';
  if (status === 'dialing') return 'Calling';
  if (status === 'connected') return 'Call answered';
  if (status === 'no_answer') return 'No answer';
  if (status === 'busy') return 'Line busy';
  if (status === 'skipped') return 'Voice disabled';
  return 'Call failed';
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder ? `${minutes}m ${remainder}s` : `${minutes} min`;
}

function CallDetailsDialog({ supplier }: { supplier: SupplierResearchNotification }) {
  const call = supplier.voiceCall;
  if (!call) return null;
  const transcript = call.interactionTranscript ?? [];
  const duration = call.durationSeconds == null ? null : Number(call.durationSeconds);
  const summary = typeof call.finalAgentVariables?.call_summary === 'string' ? call.finalAgentVariables.call_summary : null;

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}><FileTextIcon data-icon="inline-start" />View call</DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{supplier.supplierName ?? supplier.email}</DialogTitle>
          <DialogDescription>Voice notification outcome and conversation record.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Outcome</p><p className="mt-1 font-medium">{supplierCallLabel(supplier)}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Duration</p><p className="mt-1 font-medium">{duration != null && Number.isFinite(duration) ? formatDuration(duration) : '-'}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Completed</p><p className="mt-1 font-medium">{call.completedAt ? new Date(call.completedAt).toLocaleString() : '-'}</p></div>
          </div>
          {summary && <section><h3 className="text-sm font-semibold">Call summary</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{summary}</p></section>}
          <Separator />
          <section><h3 className="text-sm font-semibold">Transcript</h3><div className="mt-3 flex flex-col gap-3">{transcript.length ? transcript.map((turn, index) => <div key={`${turn.role}-${index}`} className="grid grid-cols-[4.5rem_1fr] gap-3 text-sm"><Badge variant={turn.role === 'agent' ? 'secondary' : 'outline'} className="h-fit">{turn.role === 'agent' ? 'Agent' : 'Supplier'}</Badge><p className="leading-relaxed">{turn.enText}</p></div>) : <p className="text-sm text-muted-foreground">No transcript is available.</p>}</div></section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof UsersIcon; label: string; value: string | number }) {
  return <div className="flex min-w-24 items-center gap-3 rounded-lg bg-muted/70 px-3 py-2"><Icon className="size-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-base font-semibold leading-tight">{value}</p></div></div>;
}

function ItemDetail({ icon: Icon, label, value }: { icon: typeof UsersIcon; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-2.5"><Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-medium">{value}</p></div></div>;
}

function BidMetric({ icon: Icon, label, value }: { icon: typeof UsersIcon; label: string; value: string }) {
  return <div className="border-l-2 border-border px-3 py-1 first:border-l-0 first:pl-0"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" />{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}

const SCORE_LABELS: Array<[keyof SupplierScore['components'], string]> = [
  ['categoryMatch', 'Category match'],
  ['response', 'Response probability'],
  ['price', 'Price competitiveness'],
  ['leadTime', 'Lead-time reliability'],
  ['fulfillment', 'Fulfillment history'],
  ['compliance', 'Compliance confidence'],
];

function SupplierScorePopover({ score }: { score: SupplierScore | null }) {
  if (!score) return <Badge variant="outline">Learning</Badge>;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}><ShieldCheckIcon data-icon="inline-start" />{Math.round(score.overallScore)}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader><PopoverTitle>Why recommended</PopoverTitle><PopoverDescription>Explainable score version {score.version}, based on {score.sampleSize} observed events.</PopoverDescription></PopoverHeader>
        <div className="flex flex-col gap-2">{SCORE_LABELS.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{Math.round(score.components[key])}</span></div>)}</div>
        <p className="border-t pt-2 text-xs text-muted-foreground">New suppliers receive neutral Bayesian priors until enough evidence is available.</p>
      </PopoverContent>
    </Popover>
  );
}

function ItemEvidencePopover({ supplier }: { supplier: SupplierResearchNotification }) {
  const evidence = supplier.itemEvidence;
  if (!evidence) return <Badge variant="outline">Category lead</Badge>;
  const match = Math.round(Number(evidence.matchScore) * 100);
  const confidence = Math.round(Number(evidence.evidenceScore) * 100);
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <CheckCircle2Icon data-icon="inline-start" />Item match {match}%
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96">
        <PopoverHeader>
          <PopoverTitle>Item-specific evidence</PopoverTitle>
          <PopoverDescription>{confidence}% evidence confidence · {titleCase(evidence.sourceType)} · verified {new Date(evidence.lastVerifiedAt).toLocaleDateString()}</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-3 text-sm">
          {evidence.matchedIdentifiers.length > 0 && <div className="flex flex-wrap gap-1">{evidence.matchedIdentifiers.map((identifier) => <Badge key={identifier} variant="secondary">{identifier}</Badge>)}</div>}
          {evidence.matchReasons.length > 0 && <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">{evidence.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          {(evidence.positiveSignals > 0 || evidence.negativeSignals > 0) && <p className="text-xs text-muted-foreground">Learning signals: {evidence.positiveSignals} positive · {evidence.negativeSignals} negative</p>}
          {evidence.evidenceUrls.length > 0 && <div className="flex flex-col gap-1"><p className="text-xs font-medium">Sources</p>{evidence.evidenceUrls.slice(0, 4).map((url) => <a key={url} className="truncate text-xs underline underline-offset-4" href={url} target="_blank" rel="noreferrer">{url}</a>)}</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PriceIntelligencePanel({ intelligence }: { intelligence: PriceIntelligence }) {
  const benchmark = intelligence.benchmark;
  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:items-center">
      <div><p className="text-sm font-medium">Price intelligence</p><p className="mt-1 text-xs text-muted-foreground">Landed unit costs include tax and freight.</p></div>
      {benchmark ? <>
        <div><p className="text-xs text-muted-foreground">Expected range</p><p className="mt-1 font-semibold">{money(benchmark.expectedLow, intelligence.currency)} – {money(benchmark.expectedHigh, intelligence.currency)}</p></div>
        <div><p className="text-xs text-muted-foreground">Negotiation target</p><p className="mt-1 font-semibold">{money(benchmark.negotiationTarget, intelligence.currency)}</p></div>
        <div><p className="text-xs text-muted-foreground">Protected sample</p><p className="mt-1 font-semibold">{benchmark.quoteCount} quotes · {benchmark.buyerCount} buyers</p><Badge variant="outline" className="mt-1">{benchmark.scope}</Badge></div>
      </> : <div className="md:col-span-3"><p className="text-sm font-medium">Benchmark building</p><p className="mt-1 text-xs text-muted-foreground">Ranges appear after at least {intelligence.privacyThreshold.minimumQuotes} comparable quotes from {intelligence.privacyThreshold.minimumBuyers} buyers. Individual quotes are never exposed.</p>{intelligence.previousPurchase != null && <p className="mt-2 text-sm">Your previous landed unit cost: <span className="font-semibold">{money(intelligence.previousPurchase, intelligence.currency)}</span></p>}</div>}
    </div>
  );
}

type BidSortKey = 'supplier' | 'score' | 'unitPrice' | 'total' | 'leadTime' | 'moq' | 'status';
type BidSort = { key: BidSortKey; direction: 'asc' | 'desc' };

function SortableBidHead({ label, column, sort, onSort, align = 'left' }: { label: string; column: BidSortKey; sort: BidSort; onSort: (column: BidSortKey) => void; align?: 'left' | 'right' }) {
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

function BidsTable({ requestId, line, bids, currency, bestPrice, fastestLead }: { requestId: string; line: SourcingLine; bids: SourcingBid[]; currency: string; bestPrice: number; fastestLead: number | null }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<BidSort>({ key: 'score', direction: 'desc' });
  const statuses = useMemo(() => [...new Set(bids.map((bid) => bid.status))].sort(), [bids]);
  const visibleBids = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = bids.filter((bid) => {
      const matchesStatus = status === 'all' || bid.status === status;
      const searchable = [bid.supplierName, bid.supplierCity, bid.supplierState, bid.notes].filter(Boolean).join(' ').toLocaleLowerCase();
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
    return filtered.sort((left, right) => {
      let comparison = 0;
      if (sort.key === 'supplier') comparison = left.supplierName.localeCompare(right.supplierName);
      if (sort.key === 'status') comparison = left.status.localeCompare(right.status);
      if (sort.key === 'score') comparison = (left.supplierScore?.overallScore ?? -1) - (right.supplierScore?.overallScore ?? -1);
      if (sort.key === 'unitPrice' || sort.key === 'total') comparison = Number(left.unitPrice) - Number(right.unitPrice);
      if (sort.key === 'leadTime' || sort.key === 'moq') {
        const leftValue = sort.key === 'leadTime' ? left.leadTimeDays : left.minimumOrderQty == null ? null : Number(left.minimumOrderQty);
        const rightValue = sort.key === 'leadTime' ? right.leadTimeDays : right.minimumOrderQty == null ? null : Number(right.minimumOrderQty);
        if (leftValue == null && rightValue != null) return 1;
        if (leftValue != null && rightValue == null) return -1;
        comparison = (leftValue ?? 0) - (rightValue ?? 0);
      }
      return (sort.direction === 'asc' ? comparison : -comparison) || Number(left.unitPrice) - Number(right.unitPrice);
    });
  }, [bids, query, sort, status]);

  function changeSort(key: BidSortKey) {
    setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
          <Input aria-label="Filter bids by supplier or location" placeholder="Filter supplier, location, or notes" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Select value={status} onValueChange={(value) => setStatus(value as string)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter bids by status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">All statuses</SelectItem>{statuses.map((bidStatus) => <SelectItem key={bidStatus} value={bidStatus}>{titleCase(bidStatus)}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{visibleBids.length} of {bids.length} bids</p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableBidHead label="Supplier" column="supplier" sort={sort} onSort={changeSort} />
              <SortableBidHead label="Score" column="score" sort={sort} onSort={changeSort} />
              <SortableBidHead label="Unit price" column="unitPrice" sort={sort} onSort={changeSort} align="right" />
              <SortableBidHead label="Total" column="total" sort={sort} onSort={changeSort} align="right" />
              <SortableBidHead label="Lead time" column="leadTime" sort={sort} onSort={changeSort} align="right" />
              <SortableBidHead label="MOQ" column="moq" sort={sort} onSort={changeSort} align="right" />
              <SortableBidHead label="Status" column="status" sort={sort} onSort={changeSort} />
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleBids.map((bid) => {
              const unitPrice = Number(bid.unitPrice);
              const minimumOrderQty = bid.minimumOrderQty == null ? null : Number(bid.minimumOrderQty);
              const requestedQty = Number(line.qty);
              const exceedsRequestedQty = minimumOrderQty != null
                && Number.isFinite(minimumOrderQty)
                && Number.isFinite(requestedQty)
                && minimumOrderQty > requestedQty;
              const isBestPrice = unitPrice === bestPrice;
              const isFastest = bid.leadTimeDays != null && bid.leadTimeDays === fastestLead;
              const isAccepted = bid.status === 'accepted';
              return (
                <TableRow key={bid.id} data-state={isAccepted ? 'selected' : undefined}>
                  <TableCell className="min-w-64 whitespace-normal">
                    <p className="font-medium">{bid.supplierName}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPinIcon className="size-3" />{bid.supplierCity}, {bid.supplierState}</p>
                    {bid.notes && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{bid.notes}</p>}
                  </TableCell>
                  <TableCell><SupplierScorePopover score={bid.supplierScore} /></TableCell>
                  <TableCell className="text-right font-medium"><div className="flex flex-col items-end gap-1"><span>{money(unitPrice, bid.currency || currency)} / {line.uom}</span>{isBestPrice && <Badge variant="secondary"><TrendingDownIcon data-icon="inline-start" />Best price</Badge>}</div></TableCell>
                  <TableCell className="text-right font-medium"><div className="flex flex-col items-end gap-1"><span>{money(bid.landedUnitCost * Number(line.qty), bid.currency || currency)}</span>{bid.priceSignal !== 'insufficient_data' && <Badge variant={bid.priceSignal === 'within_range' ? 'secondary' : 'outline'}>{titleCase(bid.priceSignal)}</Badge>}</div></TableCell>
                  <TableCell className="text-right"><div className="flex flex-col items-end gap-1"><span>{bid.leadTimeDays == null ? '-' : `${bid.leadTimeDays} days`}</span>{isFastest && <Badge variant="secondary"><TimerIcon data-icon="inline-start" />Fastest</Badge>}</div></TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span>{bid.minimumOrderQty ? `${bid.minimumOrderQty} ${line.uom}` : '-'}</span>
                      {exceedsRequestedQty && (
                        <Badge variant="destructive" aria-label={`Minimum order quantity exceeds requested quantity by ${minimumOrderQty - requestedQty} ${line.uom}`}>
                          <TriangleAlertIcon data-icon="inline-start" />
                          Above request (+{minimumOrderQty - requestedQty} {line.uom})
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={isAccepted ? 'default' : 'outline'}>{isAccepted ? 'Approved' : titleCase(bid.status)}</Badge></TableCell>
                  <TableCell className="text-right">{line.status === 'open' && bid.status === 'submitted' ? <AcceptBidButton requestId={requestId} lineId={line.id} bidId={bid.id} supplierName={bid.supplierName} /> : <span className="text-xs text-muted-foreground">{isAccepted ? 'Selected' : '-'}</span>}</TableCell>
                </TableRow>
              );
            })}
            {visibleBids.length === 0 && <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No bids match these filters.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function capabilityLabel(status: 'can_supply' | 'needs_clarification' | 'declined') {
  if (status === 'can_supply') return 'Can supply';
  if (status === 'needs_clarification') return 'Needs clarification';
  return 'Declined';
}

function OutreachRow({ requestId, supplier, messages }: { requestId: string; supplier: SupplierResearchNotification; messages: ItemClarificationMessage[] }) {
  const isSent = Boolean(supplier.sentAt);
  const callAnswered = supplier.voiceCall?.status === 'connected';
  const chatAction = supplier.platformSupplierId
    ? sendBuyerClarification.bind(null, requestId, supplier.sourcingLineId, supplier.platformSupplierId)
    : null;
  return (
    <div className="grid gap-3 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{supplier.supplierName ?? supplier.email}</p>{callAnswered && <Badge variant="secondary"><PhoneCallIcon data-icon="inline-start" />Answered</Badge>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{supplier.email} · {supplierLocation(supplier)}</p></div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <ItemEvidencePopover supplier={supplier} />
        <SupplierScorePopover score={supplier.supplierScore} />
        {supplier.capabilityResponse && <Badge variant={supplier.capabilityResponse.status === 'declined' ? 'outline' : 'secondary'}>{capabilityLabel(supplier.capabilityResponse.status)}</Badge>}
        <Badge variant={isSent ? 'default' : 'outline'}>{isSent ? <MailCheckIcon data-icon="inline-start" /> : <Clock3Icon data-icon="inline-start" />}{isSent ? 'Bidding email sent' : 'Email queued'}</Badge>
        {chatAction && <ItemClarificationDialog title={supplier.supplierName ?? supplier.email} description="Private clarification thread for this item. The buyer company remains hidden until award." messages={messages} currentParty="buyer" sendAction={chatAction} />}
        <CallDetailsDialog supplier={supplier} />
        <ManualOutreachButtons requestId={requestId} lineId={supplier.sourcingLineId} notificationId={supplier.id} hasPhone={Boolean(supplier.supplierPhone)} />
      </div>
    </div>
  );
}

export function SourcingDetailView({ request, currency, initialLineId }: { request: SourcingRequestDetail; currency: string; initialLineId?: string }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const firstLineId = request.lines[0]?.id ?? '';
  const [selectedLineId, setSelectedLineId] = useState(request.lines.some((line) => line.id === initialLineId) ? initialLineId! : firstLineId);
  const line = request.lines.find((item) => item.id === selectedLineId) ?? request.lines[0];
  const activeWork = request.lines.some((item) => item.researchJob?.status === 'queued' || item.researchJob?.status === 'researching' || (item.supplierResearch ?? []).some((supplier) => supplier.voiceCall?.status === 'queued' || supplier.voiceCall?.status === 'dialing'));

  useEffect(() => {
    if (!activeWork) return;
    const timer = window.setInterval(() => startRefresh(() => router.refresh()), 4_000);
    return () => window.clearInterval(timer);
  }, [activeWork, router]);

  const bids = useMemo(() => line?.bids ?? [], [line]);
  const bestPrice = bids.length ? Math.min(...bids.map((bid) => Number(bid.unitPrice))) : 0;
  const fastestLead = bids.reduce<number | null>((fastest, bid) => bid.leadTimeDays == null ? fastest : fastest == null ? bid.leadTimeDays : Math.min(fastest, bid.leadTimeDays), null);
  const notifiedTotal = request.lines.reduce((total, item) => total + (item.notifiedCount ?? 0), 0);
  const bidTotal = request.lines.reduce((total, item) => total + item.bids.length, 0);
  const suppliers = useMemo(() => [...(line?.supplierResearch ?? [])].sort((left, right) => {
    const itemDifference = Number(right.itemEvidence?.matchScore ?? -1) - Number(left.itemEvidence?.matchScore ?? -1);
    return itemDifference || (right.supplierScore?.overallScore ?? -1) - (left.supplierScore?.overallScore ?? -1);
  }), [line]);
  const job = line?.researchJob;
  const isResearchActive = job?.status === 'queued' || job?.status === 'researching';
  const canRetry = Boolean(line && job && (job.status === 'failed' || job.status === 'partial') && suppliers.length < job.targetCount && line.status === 'open');

  function selectLine(lineId: string) {
    setSelectedLineId(lineId);
    router.replace(`/sourcing/${request.id}?line=${lineId}`, { scroll: false });
  }

  if (!line) return <p className="text-sm text-muted-foreground">This request has no items.</p>;

  return (
    <div className="flex flex-col gap-5">
      <Button className="w-fit" nativeButton={false} variant="ghost" size="sm" render={<Link href="/sourcing" />}><ArrowLeftIcon data-icon="inline-start" />All requests</Button>

      <section className="border-b pb-5">
        <div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{titleCase(request.status)}</Badge><span className="text-xs text-muted-foreground">{request.source === 'bom_upload' ? 'BOM upload' : 'Manual entry'} · {new Date(request.createdAt).toLocaleDateString()}</span>{isRefreshing && <Badge variant="outline"><LoaderCircleIcon data-icon="inline-start" className="animate-spin" />Updating</Badge>}</div><CardTitle className="mt-2 truncate text-2xl font-semibold">{request.title}</CardTitle><CardDescription className="mt-1">{request.lines.length} {request.lines.length === 1 ? 'item' : 'items'} in this sourcing request</CardDescription></div>
            <div className="flex gap-2"><Metric icon={UsersIcon} label="Notified" value={notifiedTotal} /><Metric icon={SendIcon} label="Bids" value={bidTotal} /></div>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-5">
          <div className="max-w-2xl"><label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="item-selector">Selected item</label><Select value={line.id} onValueChange={(value) => selectLine(value as string)}><SelectTrigger id="item-selector" className="h-10 bg-background"><span className="truncate">{line.itemCode ? `${line.itemCode} · ` : ''}{line.description}</span></SelectTrigger><SelectContent><SelectGroup>{request.lines.map((item, index) => <SelectItem key={item.id} value={item.id}>{index + 1}. {item.itemCode ? `${item.itemCode} · ` : ''}{item.description}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-5 border-t pt-4 md:grid-cols-3 xl:grid-cols-6">
            <ItemDetail icon={Building2Icon} label="Brand / manufacturer" value={line.brandManufacturer || '-'} />
            <ItemDetail icon={HashIcon} label="HSN / MFG code" value={line.hsnMfgCode || '-'} />
            <ItemDetail icon={PackageIcon} label="Quantity" value={`${line.qty} ${line.uom}`} />
            <ItemDetail icon={MapPinIcon} label="Deliver to" value={`${line.deliveryCity}, ${line.deliveryState}`} />
            <ItemDetail icon={CalendarDaysIcon} label="Need by" value={line.needBy ? new Date(line.needBy).toLocaleDateString() : 'Not set'} />
            <ItemDetail icon={CheckCircle2Icon} label="Item status" value={titleCase(line.status)} />
          </div>
        </div>
      </section>

      <Tabs defaultValue="bids" className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="bids"><CircleDollarSignIcon />Bids <Badge variant="secondary">{bids.length}</Badge></TabsTrigger>
            <TabsTrigger value="outreach"><UsersIcon />Outreach <Badge variant="secondary">{suppliers.length}</Badge></TabsTrigger>
            <TabsTrigger value="activity"><HistoryIcon />Activity <Badge variant="secondary">{request.timeline.length}</Badge></TabsTrigger>
          </TabsList>
          {line.status === 'open' && <InviteLinePopover requestId={request.id} lineId={line.id} description={line.description} />}
        </div>

        <TabsContent value="bids" className="flex flex-col gap-4">
          {bids.length > 0 ? <>
            <div className="grid gap-3 border-b pb-4 sm:grid-cols-3">
              <BidMetric icon={CircleDollarSignIcon} label="Best unit price" value={money(bestPrice, currency)} />
              <BidMetric icon={TimerIcon} label="Fastest lead time" value={fastestLead == null ? '-' : `${fastestLead} days`} />
              <BidMetric icon={PackageIcon} label="Requested quantity" value={`${line.qty} ${line.uom}`} />
            </div>
            <PriceIntelligencePanel intelligence={line.priceIntelligence} />
            <BidsTable key={line.id} requestId={request.id} line={line} bids={bids} currency={currency} bestPrice={bestPrice} fastestLead={fastestLead} />
          </> : isResearchActive ? <SupplierResearchAnimation itemCode={line.itemCode} location={`${line.deliveryCity}, ${line.deliveryState}`} status={job.status as 'queued' | 'researching'} /> : <Empty className="min-h-56 border"><EmptyHeader><EmptyMedia variant="icon"><CircleDollarSignIcon /></EmptyMedia><EmptyTitle>Waiting for supplier bids</EmptyTitle><EmptyDescription>Notified suppliers can submit quotes while this item remains open.</EmptyDescription></EmptyHeader></Empty>}
        </TabsContent>

        <TabsContent value="outreach" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{suppliers.length} suppliers discovered or invited for this item.</p>{canRetry && <RetryResearchButton requestId={request.id} lineId={line.id} />}</div>
          {suppliers.length ? <div className="overflow-hidden rounded-lg border">{suppliers.map((supplier) => <OutreachRow key={supplier.id} requestId={request.id} supplier={supplier} messages={(line.clarificationMessages ?? []).filter((message) => message.platformSupplierId === supplier.platformSupplierId)} />)}</div> : isResearchActive ? <SupplierResearchAnimation itemCode={line.itemCode} location={`${line.deliveryCity}, ${line.deliveryState}`} status={job.status as 'queued' | 'researching'} /> : <Empty className="min-h-48 border"><EmptyHeader><EmptyMedia variant="icon"><UsersIcon /></EmptyMedia><EmptyTitle>No suppliers yet</EmptyTitle><EmptyDescription>Supplier research is {job?.status ?? 'not started'}.</EmptyDescription></EmptyHeader></Empty>}
          {job?.lastError && <p className="text-sm text-destructive">{job.lastError}</p>}
        </TabsContent>

        <TabsContent value="activity">
          {request.timeline.length ? <ol className="divide-y rounded-lg border">{request.timeline.map((entry) => {
            const lineDescription = request.lines.find((item) => item.id === entry.entityId)?.description;
            return <li key={entry.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-start"><div><p className="text-sm font-medium">{titleCase(entry.action.replaceAll('.', ' '))}</p><p className="mt-1 text-xs text-muted-foreground">{lineDescription ?? (entry.entityType === 'sourcing_request' ? request.title : titleCase(entry.entityType))} · {titleCase(entry.actorType)}</p></div><time className="text-xs text-muted-foreground" dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString()}</time></li>;
          })}</ol> : <Empty className="min-h-48 border"><EmptyHeader><EmptyMedia variant="icon"><HistoryIcon /></EmptyMedia><EmptyTitle>No activity recorded</EmptyTitle><EmptyDescription>Actions on this sourcing request will appear here.</EmptyDescription></EmptyHeader></Empty>}
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><CheckCircle2Icon className="size-3.5" /><span>Your company identity stays private until a bid is approved.</span><ChevronRightIcon className="size-3.5" /><span>Approval creates a draft purchase order.</span></div>
    </div>
  );
}
