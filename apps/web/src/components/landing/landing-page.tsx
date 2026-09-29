'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  Clock3Icon,
  FileSpreadsheetIcon,
  MailCheckIcon,
  PhoneCallIcon,
  RadarIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from 'lucide-react';
import { BrandLogo, BrandMark } from '@/components/brand';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ease = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 border-b border-black/10 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <BrandLogo markClassName="size-7" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-foreground/70 md:flex" aria-label="Landing page navigation">
          <a href="#workflow" className="transition-colors hover:text-foreground">Workflow</a>
          <a href="#voice" className="transition-colors hover:text-foreground">Voice sourcing</a>
          <a href="#suppliers" className="transition-colors hover:text-foreground">For suppliers</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/signin" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>Sign in</Link>
          <Link href="/signup" className={buttonVariants({ size: 'sm' })}>Start sourcing</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', reduceMotion ? '0%' : '10%']);
  const copyY = useTransform(scrollYProgress, [0, 1], ['0%', reduceMotion ? '0%' : '18%']);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative h-[88svh] min-h-[660px] max-h-[800px] overflow-hidden bg-background pt-16 [--background:oklch(0.99_0_0)] [--border:oklch(0.86_0.006_260)] [--foreground:oklch(0.18_0.01_260)] [--primary:oklch(0.57_0.2_255)] [--primary-foreground:oklch(0.99_0.002_255)] md:min-h-[700px]"
    >
      <motion.div className="absolute inset-0 top-16" style={{ y: imageY }}>
        <Image
          src="/landing/procurement-workspace.jpg"
          alt="Precision components, a bill of materials, and supplier quotes in a modern manufacturing workspace"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[62%_center] md:object-center"
        />
      </motion.div>
      <div className="absolute inset-0 top-16 bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.92)_31%,rgba(255,255,255,0.28)_58%,rgba(255,255,255,0)_78%)]" />
      <Header />
      <motion.div style={{ y: copyY, opacity: copyOpacity }} className="relative z-10 mx-auto flex h-full max-w-7xl items-center px-5 py-12 md:px-8">
        <div className="max-w-xl">
          <div className="mb-7 flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-xs font-medium text-foreground/70 shadow-sm backdrop-blur">
            <SparklesIcon className="size-3.5" />
            AI sourcing for every BOM line
          </div>
          <h1 className="text-5xl leading-none font-semibold tracking-normal text-foreground sm:text-6xl md:text-7xl">vProcly</h1>
          <p className="mt-5 max-w-lg text-3xl leading-tight font-medium tracking-normal text-foreground/90 sm:text-4xl">
            From BOM to qualified bids, without the chase.
          </p>
          <p className="mt-6 max-w-md text-base leading-relaxed text-foreground/65 md:text-lg">
            Upload line items once. vProcly matches known suppliers, researches new ones, calls for commercial details, and keeps every response in one place.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className={cn(buttonVariants({ size: 'lg' }), 'px-5')}>
              Create a request
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
            <Link href="/supplier/signup" className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'border-black/15 bg-white/75 px-5 backdrop-blur')}>
              Join as supplier
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

const outcomes = [
  { icon: UsersIcon, value: '5', label: 'suppliers found' },
  { icon: PhoneCallIcon, value: '100%', label: 'answer rate' },
  { icon: Clock3Icon, value: '5 days', label: 'quoted lead time' },
  { icon: MailCheckIcon, value: 'Tracked', label: 'outreach status' },
];

function OutcomeStrip() {
  return (
    <section className="border-y bg-background">
      <div className="mx-auto grid max-w-7xl grid-cols-2 px-5 md:grid-cols-4 md:px-8">
        {outcomes.map(({ icon: Icon, value, label }, index) => (
          <div key={label} className={cn('flex items-center gap-3 py-6 md:px-6', index % 2 === 1 && 'border-l', index > 1 && 'border-t md:border-t-0', index > 0 && 'md:border-l')}>
            <Icon className="size-5 text-primary" />
            <div>
              <p className="text-lg font-semibold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const workflow = [
  { number: '01', icon: FileSpreadsheetIcon, title: 'Upload the BOM', body: 'Bring the spreadsheet you already use. Each row becomes a traceable sourcing line.' },
  { number: '02', icon: RadarIcon, title: 'Research and reach out', body: 'Local matches come first. Research fills the gaps, then calls and emails are routed automatically.' },
  { number: '03', icon: CheckCircle2Icon, title: 'Compare and award', body: 'Commercial details, bids, call outcomes, and supplier status stay together until award.' },
];

function WorkflowPreview() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><BrandMark className="size-6 rounded-md" />Research</div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">Live sourcing</span>
      </div>
      <div className="grid min-h-[360px] md:grid-cols-[0.72fr_1.28fr]">
        <div className="border-b bg-secondary/35 p-5 md:border-r md:border-b-0">
          <p className="text-xs font-medium text-muted-foreground">BOM LINE 04</p>
          <h3 className="mt-3 text-xl font-semibold">Precision coolant pump</h3>
          <p className="mt-1 text-sm text-muted-foreground">1,000 Nos / Pune, Maharashtra</p>
          <div className="mt-8 flex flex-col gap-3">
            {['Database match', 'Google research', 'Voice outreach', 'Bid collection'].map((label, index) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <span className={cn('flex size-6 items-center justify-center rounded-full border text-[10px]', index < 3 ? 'border-primary bg-primary text-primary-foreground' : 'bg-background')}>
                  {index < 3 ? <CheckCircle2Icon className="size-3.5" /> : '4'}
                </span>
                <span className={index < 3 ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div><p className="text-sm font-semibold">Supplier shortlist</p><p className="text-xs text-muted-foreground">Ranked by match quality and location</p></div>
            <span className="text-xs font-medium text-primary">5 found</span>
          </div>
          <div className="flex flex-col gap-2">
            {[
              ['Apex Motion Systems', 'Local database', 'Call answered', 'Quote complete'],
              ['Pune Precision Works', 'Google research', 'Email sent', 'Awaiting bid'],
              ['Vector Components', 'Local database', 'Call queued', 'In progress'],
              ['Northstar Industrial', 'Google research', 'No answer', 'Email fallback'],
            ].map(([name, source, contact, status], index) => (
              <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{name}</p><p className="text-xs text-muted-foreground">{source}</p></div>
                <div className="text-right"><p className={cn('text-xs font-medium', index === 0 && 'text-primary')}>{contact}</p><p className="text-[11px] text-muted-foreground">{status}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowSection() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const previewY = useTransform(scrollYProgress, [0, 1], [reduceMotion ? 0 : 44, reduceMotion ? 0 : -44]);

  return (
    <section id="workflow" ref={ref} className="overflow-hidden bg-background py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-primary">One continuous workflow</p>
          <h2 className="mt-4 text-4xl leading-tight font-semibold tracking-normal md:text-5xl">Less coordination. More sourcing clarity.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">Every line moves through research, outreach, and bidding with a visible status. Your team sees what happened and what needs attention.</p>
        </Reveal>
        <motion.div style={{ y: previewY }} className="mx-auto mt-16 max-w-5xl">
          <WorkflowPreview />
        </motion.div>
        <div className="mt-20 grid gap-10 border-t pt-10 md:grid-cols-3">
          {workflow.map(({ number, icon: Icon, title, body }, index) => (
            <Reveal key={number} delay={index * 0.08}>
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{number}</span><Icon className="size-5 text-primary" /></div>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function VoiceSection() {
  return (
    <section id="voice" className="bg-neutral-950 py-24 text-white md:py-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 md:grid-cols-[0.85fr_1.15fr] md:items-center md:px-8">
        <Reveal>
          <div className="flex size-10 items-center justify-center rounded-lg border border-white/15 bg-white/5"><PhoneCallIcon className="size-5" /></div>
          <p className="mt-7 text-sm font-medium text-white/55">Voice sourcing</p>
          <h2 className="mt-4 max-w-lg text-4xl leading-tight font-semibold tracking-normal md:text-5xl">A call that becomes structured commercial data.</h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/60">The agent asks for rate, MOQ, and lead time. Answered calls become reviewable details. Missed calls move to email without losing momentum.</p>
          <div className="mt-8 flex flex-col gap-3 text-sm text-white/75">
            <span className="flex items-center gap-2"><ShieldCheckIcon className="size-4 text-green-400" />Auditable call outcome and interaction ID</span>
            <span className="flex items-center gap-2"><MailCheckIcon className="size-4 text-blue-400" />Automatic email fallback when needed</span>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="overflow-hidden rounded-lg border border-white/15 bg-white/[0.04] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div><p className="text-sm font-medium">Supplier Org</p><p className="text-xs text-white/45">Completed just now</p></div>
            <span className="rounded-full bg-green-400/15 px-3 py-1 text-xs font-medium text-green-300">Call answered</span>
          </div>
          <div className="grid gap-px bg-white/10 sm:grid-cols-2">
            {[
              ['Disposition', 'Rate and lead time confirmed'],
              ['Lead time', '5 days'],
              ['Minimum order', '500 units'],
              ['Rate at MOQ', 'INR 120 per unit'],
            ].map(([label, value]) => (
              <div key={label} className="bg-neutral-950/90 p-5"><p className="text-xs text-white/40">{label}</p><p className="mt-2 text-sm font-medium">{value}</p></div>
            ))}
          </div>
          <div className="p-5">
            <p className="text-xs text-white/40">Call summary</p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">The supplier confirmed MOQ, rate, and delivery lead time for the requested item.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section id="suppliers" className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="grid overflow-hidden rounded-lg border md:grid-cols-2">
          <Reveal className="flex min-h-80 flex-col justify-between bg-card p-8 md:p-12">
            <div><SearchIcon className="size-6 text-primary" /><p className="mt-8 text-sm font-medium text-primary">For buyers</p><h2 className="mt-3 max-w-md text-3xl font-semibold tracking-normal">Source every line with less manual follow-up.</h2><p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">Create the request, monitor outreach, compare bids, and keep an audit trail from one workspace.</p></div>
            <Link href="/signup" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold hover:underline">Create buyer account <ArrowRightIcon className="size-4" /></Link>
          </Reveal>
          <Reveal delay={0.08} className="flex min-h-80 flex-col justify-between border-t bg-secondary/45 p-8 md:border-t-0 md:border-l md:p-12">
            <div><UsersIcon className="size-6 text-primary" /><p className="mt-8 text-sm font-medium text-primary">For suppliers</p><h2 className="mt-3 max-w-md text-3xl font-semibold tracking-normal">See matched opportunities and respond in one place.</h2><p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">Receive relevant requests, submit structured bids, and track every response without exposing buyer identity before award.</p></div>
            <Link href="/supplier/signup" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold hover:underline">Register as supplier <ArrowRightIcon className="size-4" /></Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t bg-white py-24 text-center md:py-28">
      <Reveal className="mx-auto max-w-3xl px-5">
        <p className="text-sm font-medium text-primary">Ready to source</p>
        <h2 className="mt-4 text-4xl leading-tight font-semibold tracking-normal md:text-5xl">Start with the BOM already on your desk.</h2>
        <p className="mx-auto mt-5 max-w-xl text-muted-foreground">No workflow rebuild. Upload the request and let each line find its way to the right supplier.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className={buttonVariants({ size: 'lg' })}>Start sourcing <ArrowRightIcon data-icon="inline-end" /></Link>
          <Link href="/signin" className={buttonVariants({ size: 'lg', variant: 'outline' })}>Sign in</Link>
        </div>
      </Reveal>
    </section>
  );
}

export function LandingPage() {
  return (
    <main className="overflow-x-clip bg-background">
      <Hero />
      <OutcomeStrip />
      <WorkflowSection />
      <VoiceSection />
      <AudienceSection />
      <FinalCta />
      <footer className="border-t bg-background px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo markClassName="size-6 rounded-md" />
          <span>Supplier research, outreach, bidding, and award in one traceable workflow.</span>
        </div>
      </footer>
    </main>
  );
}
