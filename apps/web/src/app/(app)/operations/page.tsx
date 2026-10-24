import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ActivityIcon, AlertTriangleIcon, BrainCircuitIcon, Clock3Icon, CoinsIcon, CreditCardIcon, GaugeIcon, GitCommitHorizontalIcon, RadioIcon, SearchXIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { isOperationsHost, mainAppUrl } from '@/lib/public-urls';
import type { Me, OperationsSummary } from '@/lib/types';
import { reviewItemEquivalence } from './actions';

function duration(seconds: number | null) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function Stat({ icon: Icon, label, value, detail, unhealthy = false }: { icon: typeof ActivityIcon; label: string; value: string | number; detail: string; unhealthy?: boolean }) {
  return (
    <div className="border-l-2 border-border px-4 py-1 first:border-l-0 first:pl-0">
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" />{label}</p>
      <p className={unhealthy ? 'mt-1 text-xl font-semibold text-destructive' : 'mt-1 text-xl font-semibold'}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default async function OperationsPage() {
  if (!isOperationsHost((await headers()).get('host')) && process.env.OPERATIONS_URL) {
    redirect(process.env.OPERATIONS_URL);
  }
  const me = await api<Me>('/me');
  if (!me.user.roles.includes('tenant_admin')) redirect(`${mainAppUrl()}/home`);
  const summary = await api<OperationsSummary>('/operations/summary');
  const errorPercent = summary.api.errorRate * 100;
  const deliveryRows = [...summary.deliveryStatus, ...summary.callStatus.map((row) => ({ ...row, channel: 'voice latest' }))];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Badge variant="outline">Internal</Badge><span className="text-xs text-muted-foreground">Updated {new Date(summary.generatedAt).toLocaleTimeString()}</span></div>
          <h1 className="mt-2 text-2xl font-semibold">Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Delivery, processing, payments, and service health for this workspace.</p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}><ActivityIcon data-icon="inline-start" />Refresh</Button>
      </header>

      <section aria-labelledby="service-health">
        <h2 id="service-health" className="text-sm font-semibold">Service health</h2>
        <div className="mt-4 grid gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={GaugeIcon} label="API error rate" value={`${errorPercent.toFixed(1)}%`} detail={`${summary.api.errorCount} errors / ${summary.api.requestCount} requests`} unhealthy={errorPercent >= 2} />
          <Stat icon={Clock3Icon} label="API p95 latency" value={`${summary.api.p95LatencyMs} ms`} detail={`${summary.api.windowMinutes}-minute window`} unhealthy={summary.api.p95LatencyMs >= 1_500} />
          <Stat icon={RadioIcon} label="Pending queue" value={summary.queue.pending_count} detail={`Oldest ${duration(summary.queue.oldest_age_seconds)}`} unhealthy={summary.queue.pending_count > 20 || (summary.queue.oldest_age_seconds ?? 0) > 300} />
          <Stat icon={GitCommitHorizontalIcon} label="Deployment" value={summary.releaseVersion.slice(0, 18)} detail={`API since ${new Date(summary.api.startedAt).toLocaleString()}`} />
        </div>
      </section>

      <section aria-labelledby="research-economics">
        <div className="flex items-center justify-between"><h2 id="research-economics" className="text-sm font-semibold">Research intelligence · last 30 days</h2><Badge variant="secondary">{summary.researchEconomics.runs} runs</Badge></div>
        <div className="mt-4 grid gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={BrainCircuitIcon} label="Cached supplier matches" value={summary.researchEconomics.cache_hits} detail={`${summary.researchEconomics.candidates_found} total qualified candidates`} />
          <Stat icon={SearchXIcon} label="Gemini calls" value={summary.researchEconomics.gemini_calls} detail={`${summary.researchEconomics.gemini_input_tokens + summary.researchEconomics.gemini_output_tokens} tokens · ${summary.researchEconomics.grounding_queries} searches`} />
          <Stat icon={RadioIcon} label="Places calls" value={summary.researchEconomics.places_calls} detail={`${summary.researchEconomics.places_id_searches} free ID searches · ${summary.researchEconomics.places_detail_calls} details`} />
          <Stat icon={CoinsIcon} label="Estimated research cost" value={`₹${(summary.researchEconomics.estimated_cost_micros / 1_000_000).toFixed(2)}`} detail="Token and billable-event estimate, excluding free allowances and GST" />
        </div>
      </section>

      <section className="grid gap-8 border-y py-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Delivery status</h2><Badge variant="secondary">{deliveryRows.reduce((sum, row) => sum + row.count, 0)} attempts</Badge></div>
          <div className="mt-3 overflow-hidden rounded-lg border">
            <Table><TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader><TableBody>
              {deliveryRows.map((row) => <TableRow key={`${row.channel}-${row.status}`}><TableCell className="font-medium capitalize">{row.channel}</TableCell><TableCell><Badge variant={row.status === 'failed' ? 'destructive' : 'outline'}>{row.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell className="text-right tabular-nums">{row.count}</TableCell></TableRow>)}
              {!deliveryRows.length && <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No delivery attempts recorded.</TableCell></TableRow>}
            </TableBody></Table>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Reconciliation</h2><Badge variant={summary.paymentMismatches.length || summary.webhookFailures ? 'destructive' : 'secondary'}>{summary.paymentMismatches.length + summary.webhookFailures} issues</Badge></div>
          <div className="mt-3 divide-y rounded-lg border">
            <div className="flex items-center justify-between gap-4 p-4"><div className="flex items-center gap-3"><CreditCardIcon className="size-4 text-muted-foreground" /><div><p className="text-sm font-medium">Payment/order mismatches</p><p className="text-xs text-muted-foreground">Unconfirmed orders older than 15 minutes or uncredited payments</p></div></div><span className="text-lg font-semibold">{summary.paymentMismatches.length}</span></div>
            <div className="flex items-center justify-between gap-4 p-4"><div className="flex items-center gap-3"><AlertTriangleIcon className="size-4 text-muted-foreground" /><div><p className="text-sm font-medium">Webhook failures</p><p className="text-xs text-muted-foreground">Server errors observed in the current API window</p></div></div><span className="text-lg font-semibold">{summary.webhookFailures}</span></div>
            <div className="flex items-center justify-between gap-4 p-4"><div className="flex items-center gap-3"><Clock3Icon className="size-4 text-muted-foreground" /><div><p className="text-sm font-medium">Queue processing p95</p><p className="text-xs text-muted-foreground">Published events during the last hour</p></div></div><span className="text-lg font-semibold">{Math.round(summary.queue.p95_processing_ms ?? 0)} ms</span></div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Failed research jobs</h2><Badge variant={summary.failedResearchJobs.length ? 'destructive' : 'secondary'}>{summary.failedResearchJobs.length}</Badge></div>
        {summary.failedResearchJobs.length ? <div className="mt-3 overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Item</TableHead><TableHead>Attempts</TableHead><TableHead>Failure</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader><TableBody>{summary.failedResearchJobs.map((job) => <TableRow key={job.jobId}><TableCell><Link className="font-medium hover:underline" href={`${mainAppUrl()}/sourcing/${job.requestId}?line=${job.sourcingLineId}`}>{job.requestTitle}</Link></TableCell><TableCell className="max-w-64 truncate">{job.itemDescription}</TableCell><TableCell>{job.attemptCount}</TableCell><TableCell className="max-w-80 whitespace-normal text-sm text-destructive">{job.lastError ?? 'No failure detail recorded'}</TableCell><TableCell className="text-xs text-muted-foreground">{new Date(job.updatedAt).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table></div> : <Empty className="mt-3 min-h-40 border"><EmptyHeader><EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia><EmptyTitle>No failed research</EmptyTitle><EmptyDescription>Supplier discovery jobs are currently healthy.</EmptyDescription></EmptyHeader></Empty>}
      </section>

      <section>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Item-equivalence review</h2><Badge variant={summary.itemEquivalenceReviews.length ? 'outline' : 'secondary'}>{summary.itemEquivalenceReviews.length}</Badge></div>
        {summary.itemEquivalenceReviews.length ? <div className="mt-3 overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>Requested item</TableHead><TableHead>Existing item memory</TableHead><TableHead>Confidence</TableHead><TableHead>Evidence</TableHead><TableHead className="text-right">Decision</TableHead></TableRow></TableHeader><TableBody>{summary.itemEquivalenceReviews.map((review) => <TableRow key={review.id}><TableCell className="max-w-72 whitespace-normal font-medium">{review.sourceDescription}</TableCell><TableCell className="max-w-72 whitespace-normal">{review.targetDescription}</TableCell><TableCell>{Math.round(Number(review.confidence) * 100)}%</TableCell><TableCell>{review.evidenceUrls.length ? <a className="text-sm underline underline-offset-4" href={review.evidenceUrls[0]} target="_blank" rel="noreferrer">Source</a> : <span className="text-sm text-muted-foreground">Text similarity</span>}</TableCell><TableCell><div className="flex justify-end gap-2"><form action={reviewItemEquivalence.bind(null, review.id, 'rejected')}><Button type="submit" size="sm" variant="outline">Reject</Button></form><form action={reviewItemEquivalence.bind(null, review.id, 'approved')}><Button type="submit" size="sm">Approve</Button></form></div></TableCell></TableRow>)}</TableBody></Table></div> : <Empty className="mt-3 min-h-40 border"><EmptyHeader><EmptyMedia variant="icon"><BrainCircuitIcon /></EmptyMedia><EmptyTitle>No equivalences awaiting review</EmptyTitle><EmptyDescription>Possible item mappings found by retrieval will appear here before they can influence matching.</EmptyDescription></EmptyHeader></Empty>}
      </section>

      <section>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Delayed work</h2><Badge variant={summary.delayedTasks.length ? 'destructive' : 'secondary'}>{summary.delayedTasks.length}</Badge></div>
        {summary.delayedTasks.length ? <div className="mt-3 overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Task</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Age</TableHead></TableRow></TableHeader><TableBody>{summary.delayedTasks.map((task) => <TableRow key={`${task.kind}-${task.id}`}><TableCell className="capitalize">{task.kind}</TableCell><TableCell className="max-w-xl truncate font-medium">{task.label}</TableCell><TableCell><Badge variant="outline">{task.status}</Badge></TableCell><TableCell className="text-right text-destructive">{duration(task.ageSeconds)}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="mt-3 rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">No delayed work detected.</p>}
      </section>
    </div>
  );
}
