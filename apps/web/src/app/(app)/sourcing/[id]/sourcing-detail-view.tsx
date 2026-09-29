'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  AwardIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  Clock3Icon,
  FileTextIcon,
  LoaderCircleIcon,
  MailCheckIcon,
  MapPinIcon,
  PackageIcon,
  PhoneCallIcon,
  SendIcon,
  SparklesIcon,
  TimerIcon,
  TrendingDownIcon,
  UsersIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { SourcingBid, SourcingLine, SourcingRequestDetail, SupplierResearchNotification } from '@/lib/types';
import { AcceptBidButton } from './accept-bid-button';
import { InviteLinePopover } from './invite-line-popover';
import { ManualOutreachButtons } from './manual-outreach-buttons';
import { RetryResearchButton } from './retry-research-button';

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
  const variables = Object.entries(call.finalAgentVariables ?? {}).filter(([, value]) => value != null && value !== '');
  const transcript = call.interactionTranscript ?? [];
  const duration = call.durationSeconds == null ? null : Number(call.durationSeconds);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}><FileTextIcon data-icon="inline-start" />View call</DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{supplier.supplierName ?? supplier.email}</DialogTitle>
          <DialogDescription>Voice outreach result and extracted quote details.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Outcome</p><p className="mt-1 font-medium">{supplierCallLabel(supplier)}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Duration</p><p className="mt-1 font-medium">{duration != null && Number.isFinite(duration) ? formatDuration(duration) : '-'}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Completed</p><p className="mt-1 font-medium">{call.completedAt ? new Date(call.completedAt).toLocaleString() : '-'}</p></div>
          </div>
          {variables.length > 0 && <section><h3 className="text-sm font-semibold">Extracted details</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{variables.map(([key, value]) => <div key={key}><p className="text-xs text-muted-foreground">{titleCase(key)}</p><p className="mt-0.5 text-sm font-medium">{String(value)}</p></div>)}</div></section>}
          <Separator />
          <section><h3 className="text-sm font-semibold">Transcript</h3><div className="mt-3 flex flex-col gap-3">{transcript.length ? transcript.map((turn, index) => <div key={`${turn.role}-${index}`} className="grid grid-cols-[4.5rem_1fr] gap-3 text-sm"><Badge variant={turn.role === 'agent' ? 'secondary' : 'outline'} className="h-fit">{turn.role === 'agent' ? 'Agent' : 'Supplier'}</Badge><p className="leading-relaxed">{turn.enText}</p></div>) : <p className="text-sm text-muted-foreground">No transcript is available.</p>}</div></section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof UsersIcon; label: string; value: string | number }) {
  return <div className="min-w-28 border-l pl-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</div><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

function QuoteCard({ requestId, line, bid, currency, rank, bestPrice, fastestLead }: { requestId: string; line: SourcingLine; bid: SourcingBid; currency: string; rank: number; bestPrice: number; fastestLead: number | null }) {
  const unitPrice = Number(bid.unitPrice);
  const total = unitPrice * Number(line.qty);
  const isBestPrice = unitPrice === bestPrice;
  const isFastest = bid.leadTimeDays != null && bid.leadTimeDays === fastestLead;
  const isAccepted = bid.status === 'accepted';

  return (
    <Card className={isAccepted ? 'rounded-lg border bg-background shadow-none ring-2 ring-primary' : 'rounded-lg border bg-background shadow-none ring-0'}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={isBestPrice ? 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground' : 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold'}>{rank}</div>
            <div className="min-w-0"><CardTitle className="truncate">{bid.supplierName}</CardTitle><p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPinIcon className="size-3" />{bid.supplierCity}, {bid.supplierState}</p></div>
          </div>
          <Badge variant={isAccepted ? 'default' : 'outline'}>{isAccepted ? 'Approved' : titleCase(bid.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div><p className="text-xs text-muted-foreground">Unit price</p><div className="mt-1 flex flex-wrap items-baseline gap-2"><p className="text-2xl font-semibold tracking-tight">{money(bid.unitPrice, currency)}</p><span className="text-xs text-muted-foreground">per {line.uom}</span></div></div>
        <div className="flex flex-wrap gap-2">{isBestPrice && <Badge variant="secondary"><TrendingDownIcon data-icon="inline-start" />Best price</Badge>}{isFastest && <Badge variant="secondary"><TimerIcon data-icon="inline-start" />Fastest delivery</Badge>}</div>
        <div className="grid grid-cols-3 gap-3 border-y py-3">
          <div><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-semibold">{money(total, currency)}</p></div>
          <div><p className="text-xs text-muted-foreground">Lead time</p><p className="mt-1 font-semibold">{bid.leadTimeDays ? `${bid.leadTimeDays} days` : '-'}</p></div>
          <div><p className="text-xs text-muted-foreground">MOQ</p><p className="mt-1 font-semibold">{bid.minimumOrderQty ? `${bid.minimumOrderQty} ${line.uom}` : '-'}</p></div>
        </div>
        <div><p className="text-xs text-muted-foreground">Supplier note</p><p className="mt-1 min-h-10 text-sm leading-relaxed">{bid.notes || 'No additional notes provided.'}</p></div>
      </CardContent>
      {line.status === 'open' && bid.status === 'submitted' && <CardFooter className="justify-end"><AcceptBidButton requestId={requestId} lineId={line.id} bidId={bid.id} supplierName={bid.supplierName} /></CardFooter>}
      {isAccepted && <CardFooter className="gap-2 text-sm font-medium"><AwardIcon className="size-4 text-primary" />Selected supplier for this item</CardFooter>}
    </Card>
  );
}

function OutreachRow({ requestId, supplier }: { requestId: string; supplier: SupplierResearchNotification }) {
  const isSent = Boolean(supplier.sentAt);
  const callAnswered = supplier.voiceCall?.status === 'connected';
  return (
    <div className="grid gap-3 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{supplier.supplierName ?? supplier.email}</p>{callAnswered && <Badge variant="secondary"><PhoneCallIcon data-icon="inline-start" />Answered</Badge>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{supplier.email} · {supplierLocation(supplier)}</p></div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end"><Badge variant={isSent ? 'default' : 'outline'}>{isSent ? <MailCheckIcon data-icon="inline-start" /> : <Clock3Icon data-icon="inline-start" />}{isSent ? 'Notified' : 'Queued'}</Badge><CallDetailsDialog supplier={supplier} /><ManualOutreachButtons requestId={requestId} lineId={supplier.sourcingLineId} notificationId={supplier.id} hasPhone={Boolean(supplier.supplierPhone)} /></div>
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

  const bids = useMemo(() => [...(line?.bids ?? [])].sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice)), [line]);
  const bestPrice = bids.length ? Number(bids[0]!.unitPrice) : 0;
  const fastestLead = bids.reduce<number | null>((fastest, bid) => bid.leadTimeDays == null ? fastest : fastest == null ? bid.leadTimeDays : Math.min(fastest, bid.leadTimeDays), null);
  const notifiedTotal = request.lines.reduce((total, item) => total + (item.notifiedCount ?? 0), 0);
  const bidTotal = request.lines.reduce((total, item) => total + item.bids.length, 0);
  const suppliers = line?.supplierResearch ?? [];
  const job = line?.researchJob;
  const canRetry = Boolean(line && job && (job.status === 'failed' || job.status === 'partial') && suppliers.length < job.targetCount && line.status === 'open');

  function selectLine(lineId: string) {
    setSelectedLineId(lineId);
    router.replace(`/sourcing/${request.id}?line=${lineId}`, { scroll: false });
  }

  if (!line) return <p className="text-sm text-muted-foreground">This request has no items.</p>;

  return (
    <div className="flex flex-col gap-6 bg-background">
      <header className="flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" render={<Link href="/sourcing" />}><ArrowLeftIcon data-icon="inline-start" />All items</Button>
          <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="secondary">{titleCase(request.status)}</Badge><span className="text-xs text-muted-foreground">{request.source === 'bom_upload' ? 'BOM upload' : 'Manual entry'} · {new Date(request.createdAt).toLocaleDateString()}</span>{isRefreshing && <Badge variant="outline"><LoaderCircleIcon data-icon="inline-start" className="animate-spin" />Updating</Badge>}</div>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{request.title}</h1>
        </div>
        <div className="flex items-end gap-6"><Metric icon={UsersIcon} label="Notified" value={notifiedTotal} /><Metric icon={SendIcon} label="Bids" value={bidTotal} /></div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)] lg:items-end">
        <div><label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="item-selector">Viewing item</label><Select value={line.id} onValueChange={(value) => selectLine(value as string)}><SelectTrigger id="item-selector" className="h-10 bg-background"><span className="truncate">{line.itemCode ? `${line.itemCode} · ` : ''}{line.description}</span></SelectTrigger><SelectContent><SelectGroup>{request.lines.map((item, index) => <SelectItem key={item.id} value={item.id}>{index + 1}. {item.itemCode ? `${item.itemCode} · ` : ''}{item.description}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border bg-background p-4 sm:grid-cols-3 xl:grid-cols-6">
          <div><p className="text-xs text-muted-foreground">Brand / manufacturer</p><p className="mt-1 truncate font-medium">{line.brandManufacturer || '-'}</p></div>
          <div><p className="text-xs text-muted-foreground">HSN / MFG code</p><p className="mt-1 truncate font-medium">{line.hsnMfgCode || '-'}</p></div>
          <div><p className="text-xs text-muted-foreground">Quantity</p><p className="mt-1 font-medium">{line.qty} {line.uom}</p></div>
          <div><p className="text-xs text-muted-foreground">Deliver to</p><p className="mt-1 truncate font-medium">{line.deliveryCity}, {line.deliveryState}</p></div>
          <div><p className="text-xs text-muted-foreground">Need by</p><p className="mt-1 font-medium">{line.needBy ? new Date(line.needBy).toLocaleDateString() : 'Not set'}</p></div>
          <div><p className="text-xs text-muted-foreground">Item status</p><p className="mt-1 font-medium">{titleCase(line.status)}</p></div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><SparklesIcon className="size-4 text-primary" /><h2 className="text-lg font-semibold">Supplier bid comparison</h2></div><p className="mt-1 text-sm text-muted-foreground">Quotes are ranked by unit price, with delivery speed highlighted separately.</p></div>{line.status === 'open' && <InviteLinePopover requestId={request.id} lineId={line.id} description={line.description} />}</div>
        {bids.length > 0 ? <>
          <div className="grid overflow-hidden rounded-lg border bg-background sm:grid-cols-3">
            <div className="p-4"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CircleDollarSignIcon className="size-3.5" />Best unit price</p><p className="mt-1 text-lg font-semibold">{money(bestPrice, currency)}</p></div>
            <div className="border-y p-4 sm:border-x sm:border-y-0"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><TimerIcon className="size-3.5" />Fastest lead time</p><p className="mt-1 text-lg font-semibold">{fastestLead == null ? '-' : `${fastestLead} days`}</p></div>
            <div className="p-4"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><PackageIcon className="size-3.5" />Requested quantity</p><p className="mt-1 text-lg font-semibold">{line.qty} {line.uom}</p></div>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">{bids.map((bid, index) => <QuoteCard key={bid.id} requestId={request.id} line={line} bid={bid} currency={currency} rank={index + 1} bestPrice={bestPrice} fastestLead={fastestLead} />)}</div>
        </> : <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed text-center"><CircleDollarSignIcon className="size-8 text-muted-foreground" /><h3 className="mt-3 font-medium">Waiting for supplier bids</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Notified suppliers can submit quotes while this item remains open.</p></div>}
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Supplier outreach</h2><p className="mt-1 text-sm text-muted-foreground">{suppliers.length} suppliers discovered or invited for this item.</p></div>{canRetry && <RetryResearchButton requestId={request.id} lineId={line.id} />}</div>
        <div className="overflow-hidden rounded-lg border bg-background">{suppliers.length ? suppliers.map((supplier) => <OutreachRow key={supplier.id} requestId={request.id} supplier={supplier} />) : <div className="flex min-h-32 items-center justify-center px-4 text-sm text-muted-foreground">Supplier research is {job?.status ?? 'not started'}.</div>}</div>
        {job?.lastError && <p className="text-sm text-destructive">{job.lastError}</p>}
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><CheckCircle2Icon className="size-3.5" /><span>Your company identity stays private until a bid is approved.</span><ChevronRightIcon className="size-3.5" /><span>Approval creates a draft purchase order.</span></div>
    </div>
  );
}
