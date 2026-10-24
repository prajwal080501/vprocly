import { Badge } from '@/components/ui/badge';
import {
  Building2Icon,
  CheckIcon,
  MapPinIcon,
  PackageSearchIcon,
  RadarIcon,
  ScanSearchIcon,
  SparklesIcon,
} from 'lucide-react';

export function SupplierResearchAnimation({
  itemCode,
  location,
  status,
}: {
  itemCode?: string | null;
  location: string;
  status: 'queued' | 'researching';
}) {
  return (
    <section className="research-experience grid min-h-72 overflow-hidden rounded-3xl border bg-card lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)]" role="status" aria-live="polite">
      <div className="relative flex flex-col justify-center gap-5 p-6 sm:p-9">
        <Badge className="w-fit" variant="secondary">
          <SparklesIcon data-icon="inline-start" />
          {status === 'queued' ? 'Research queued' : 'Researching live'}
        </Badge>
        <div className="flex max-w-lg flex-col gap-2">
          <h3 className="text-balance text-2xl font-semibold tracking-tight">Finding the strongest supplier matches</h3>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Our research agent is matching {itemCode ? `item ${itemCode}` : 'your exact specification'}, checking public evidence, and verifying suppliers near {location}.
          </p>
        </div>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <p className="flex items-center gap-2"><ScanSearchIcon className="size-4 text-primary" />Read item signals</p>
          <p className="flex items-center gap-2"><RadarIcon className="size-4 text-primary" />Scan trusted sources</p>
          <p className="flex items-center gap-2"><CheckIcon className="size-4 text-primary" />Verify businesses</p>
        </div>
      </div>

      <div className="research-visual-stage relative min-h-72 overflow-hidden" aria-hidden="true">
        <div className="research-ambient research-ambient-one" />
        <div className="research-ambient research-ambient-two" />
        <div className="research-grid-plane" />
        <div className="research-visual-scene">
          <div className="supplier-research-orbit supplier-research-orbit-outer" />
          <div className="supplier-research-orbit supplier-research-orbit-inner" />
          <div className="supplier-research-core">
            <PackageSearchIcon className="size-8" />
            <span className="supplier-research-core-pulse" />
          </div>
          <div className="research-float-card research-float-card-one">
            <Building2Icon className="size-5 text-primary" />
            <span><strong>Supplier found</strong><small>Evidence matching</small></span>
          </div>
          <div className="research-float-card research-float-card-two">
            <MapPinIcon className="size-5 text-primary" />
            <span><strong>Location verified</strong><small>{location}</small></span>
          </div>
          <div className="research-float-card research-float-card-three">
            <ScanSearchIcon className="size-5 text-primary" />
            <span><strong>Sources scanning</strong><small>Live web research</small></span>
          </div>
          <span className="research-signal research-signal-one" />
          <span className="research-signal research-signal-two" />
          <span className="research-signal research-signal-three" />
        </div>
      </div>
    </section>
  );
}
