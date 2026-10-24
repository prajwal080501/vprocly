import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ActivityIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  Globe2Icon,
  RefreshCwIcon,
  ServerIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { PublicPageShell } from '@/components/public-page-shell';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'System Status',
  description: 'Current availability of the vProcly website, API, and core data services.',
};

export const dynamic = 'force-dynamic';

type CheckResult = {
  operational: boolean;
  latencyMs: number | null;
};

function apiOrigin() {
  const configured = process.env.API_URL ?? 'http://localhost:4000/api';
  return configured.replace(/\/api\/?$/, '').replace(/\/$/, '');
}

async function check(path: string): Promise<CheckResult> {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${apiOrigin()}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    return { operational: response.ok, latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { operational: false, latencyMs: null };
  }
}

function ServiceRow({ icon: Icon, name, description, result }: { icon: typeof Globe2Icon; name: string; description: string; result: CheckResult }) {
  return (
    <div className="flex items-center gap-4 px-5 py-5 sm:px-6">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-white/60 bg-white/70 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-950 dark:text-white">{name}</p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn('flex items-center gap-1.5 text-sm font-medium', result.operational ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
          <span className={cn('size-2 rounded-full', result.operational ? 'bg-emerald-500' : 'bg-amber-500')} />
          {result.operational ? 'Operational' : 'Unavailable'}
        </span>
        {result.latencyMs != null && <span className="text-xs tabular-nums text-slate-400">{result.latencyMs} ms</span>}
      </div>
    </div>
  );
}

export default async function StatusPage() {
  const [api, data] = await Promise.all([check('/health/live'), check('/health/ready')]);
  const website: CheckResult = { operational: true, latencyMs: null };
  const services = [website, api, data];
  const operationalCount = services.filter((service) => service.operational).length;
  const allOperational = operationalCount === services.length;
  const checkedAt = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());

  return (
    <PublicPageShell>
      <div className="relative isolate overflow-hidden bg-[#f4f7fb] text-slate-950 dark:bg-[#0b0d12] dark:text-white">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_22%_8%,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_78%_16%,rgba(16,185,129,0.14),transparent_31%)] dark:bg-[radial-gradient(circle_at_22%_8%,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_78%_16%,rgba(16,185,129,0.12),transparent_31%)]" />
        <div className="mx-auto max-w-4xl px-5 py-14 md:px-8 md:py-20">
          <div className="text-center">
            <Badge className="border-white/70 bg-white/65 px-3 py-1 text-slate-600 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/8 dark:text-slate-300" variant="outline">
              <ActivityIcon className="size-3.5" /> Live system status
            </Badge>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">vProcly status</h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-500 dark:text-slate-400">Real-time availability for the public website and the core services that power sourcing and supplier workflows.</p>
          </div>

          <section className="mt-12 overflow-hidden rounded-[2rem] border border-white/70 bg-white/72 shadow-[0_28px_80px_rgba(30,64,175,0.10)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.055] dark:shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
            <div className="flex flex-col gap-5 border-b border-slate-200/80 px-6 py-7 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
              <div className="flex items-center gap-4">
                <span className={cn('flex size-12 items-center justify-center rounded-full shadow-sm', allOperational ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white')}>
                  {allOperational ? <CheckCircle2Icon className="size-6" /> : <TriangleAlertIcon className="size-6" />}
                </span>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{allOperational ? 'All systems operational' : 'Some systems need attention'}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{operationalCount} of {services.length} services available</p>
                </div>
              </div>
              <Link href="/status" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'rounded-full border-white/80 bg-white/70 text-slate-700 shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/12')}>
                <RefreshCwIcon data-icon="inline-start" />Refresh
              </Link>
            </div>

            <div className="divide-y divide-slate-200/80 dark:divide-white/10">
              <ServiceRow icon={Globe2Icon} name="Website" description="Public site and account entry points" result={website} />
              <ServiceRow icon={ServerIcon} name="Application API" description="Sourcing, supplier, and bidding services" result={api} />
              <ServiceRow icon={DatabaseIcon} name="Core data" description="Primary data-service readiness" result={data} />
            </div>
          </section>

          <div className="mt-6 flex flex-col items-center justify-between gap-3 px-2 text-center text-xs text-slate-400 sm:flex-row sm:text-left">
            <p>Last checked {checkedAt} IST</p>
            <p>Checks refresh when this page is loaded.</p>
          </div>

          <section className="mt-12 rounded-[1.5rem] border border-white/60 bg-white/50 p-6 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035] sm:p-7">
            <h2 className="font-semibold">Having trouble?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">If the systems above are operational but you are still experiencing an issue, contact us with your company name and a short description of what happened.</p>
            <a className="mt-4 inline-flex text-sm font-medium text-blue-600 hover:underline dark:text-blue-400" href="mailto:support@vprocly.com">support@vprocly.com</a>
          </section>
        </div>
      </div>
    </PublicPageShell>
  );
}
