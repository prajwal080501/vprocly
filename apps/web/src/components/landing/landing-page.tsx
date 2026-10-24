'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import {
  ArrowRightIcon, CheckCircle2Icon, Clock3Icon, FileSpreadsheetIcon, MailCheckIcon,
  PhoneCallIcon, RadarIcon, SearchIcon, ShieldCheckIcon, SparklesIcon, UsersIcon,
} from 'lucide-react';
import { BrandLogo, BrandMark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProcurementVoiceDemo } from './procurement-voice-demo';

const ease = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.65, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="vProcly home"><BrandLogo markClassName="size-7" /></Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Landing page navigation">
          <a href="#workflow" className="transition-colors hover:text-foreground">Workflow</a>
          <a href="#voice" className="transition-colors hover:text-foreground">Voice sourcing</a>
          <a href="#suppliers" className="transition-colors hover:text-foreground">For suppliers</a>
          <Link href="/contact" className="transition-colors hover:text-foreground">Contact</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/signin" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>Sign in</Link>
          <Link href="/signup" className={buttonVariants({ size: 'sm' })}>Start sourcing</Link>
        </div>
      </div>
    </header>
  );
}

function HeroIllustration() {
  const reduceMotion = useReducedMotion();
  const float = (delay: number, distance: number) => reduceMotion ? undefined : {
    y: [0, -distance, 0],
    transition: { duration: 5.5, delay, repeat: Infinity, ease: 'easeInOut' as const },
  };

  return (
    <div className="relative size-full overflow-hidden">
      <Image
        src="/landing/procurement-workspace.jpg"
        alt="Precision components, a bill of materials, and supplier quotes in a modern manufacturing workspace"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[64%_center]"
      />
      <div className="landing-hero-image-tint absolute inset-0" />
      <motion.div
        animate={float(0.2, 10)}
        className="absolute right-[6%] top-[21%] hidden w-56 rounded-lg border bg-card/90 p-4 shadow-xl shadow-foreground/10 backdrop-blur-md lg:block"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><RadarIcon className="size-4" /></span>
            Supplier match
          </div>
          <Badge variant="secondary">Live</Badge>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {['Apex Motion Systems', 'Pune Precision Works', 'Vector Components'].map((name, index) => (
            <div key={name} className="flex items-center gap-2 rounded-md border bg-background/80 px-2.5 py-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{name}</span>
              {index === 0 && <CheckCircle2Icon className="size-3.5 text-primary" />}
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div
        animate={float(1.1, 8)}
        className="absolute bottom-[16%] right-[24%] hidden min-w-44 rounded-lg border bg-card/90 p-3 shadow-xl shadow-foreground/10 backdrop-blur-md md:block"
      >
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-secondary text-primary"><CheckCircle2Icon className="size-4" /></span>
          <div><p className="text-[11px] text-muted-foreground">Best qualified bid</p><p className="text-sm font-semibold">INR 120 / unit</p></div>
        </div>
      </motion.div>
    </div>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const mediaY = useTransform(scrollYProgress, [0, 1], ['0%', reduceMotion ? '0%' : '8%']);
  const copyY = useTransform(scrollYProgress, [0, 1], ['0%', reduceMotion ? '0%' : '14%']);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.78], [1, 0]);

  return (
    <section ref={ref} className="relative h-[88svh] min-h-[680px] max-h-[820px] overflow-hidden bg-background pt-16">
      <motion.div className="absolute inset-0 top-16" style={{ y: mediaY }}><HeroIllustration /></motion.div>
      <div className="landing-hero-scrim pointer-events-none absolute inset-0 top-16" />
      <Header />
      <motion.div style={{ y: copyY, opacity: copyOpacity }} className="relative z-10 mx-auto flex h-full max-w-7xl items-center px-5 pb-16 md:px-8">
        <div className="max-w-xl">
          <Badge variant="secondary" className="gap-2 border bg-background/75 py-1.5 backdrop-blur">
            <SparklesIcon className="size-3.5 text-primary" />AI sourcing for every BOM line
          </Badge>
          <h1 className="mt-7 text-5xl leading-none font-semibold tracking-normal sm:text-6xl md:text-7xl">vProcly</h1>
          <p className="mt-5 max-w-lg text-3xl leading-tight font-medium tracking-normal text-foreground/90 sm:text-4xl">From BOM to qualified bids, without the chase.</p>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">Upload line items once. vProcly finds suppliers, coordinates outreach, and keeps every commercial response in one clear workspace.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={cn(buttonVariants({ size: 'lg' }), 'justify-center px-5')}>Create a request <ArrowRightIcon data-icon="inline-end" /></Link>
            <Link href="/supplier/signup" className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'justify-center bg-background/70 px-5 backdrop-blur')}>Join as supplier</Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

const outcomes = [
  { icon: UsersIcon, value: '5', label: 'suppliers found' },
  { icon: PhoneCallIcon, value: '100%', label: 'outreach tracked' },
  { icon: Clock3Icon, value: '5 days', label: 'quoted lead time' },
  { icon: MailCheckIcon, value: 'Live', label: 'bid status' },
];

function OutcomeStrip() {
  return (
    <section className="border-y bg-background">
      <div className="mx-auto grid max-w-7xl grid-cols-2 px-5 md:grid-cols-4 md:px-8">
        {outcomes.map(({ icon: Icon, value, label }, index) => (
          <div key={label} className={cn('flex items-center gap-3 py-6 md:px-6', index % 2 === 1 && 'border-l', index > 1 && 'border-t md:border-t-0', index > 0 && 'md:border-l')}>
            <Icon className="size-5 text-primary" /><div><p className="text-lg font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

const workflow = [
  { number: '01', icon: FileSpreadsheetIcon, title: 'Upload the BOM', body: 'Bring the spreadsheet you already use. Each row becomes a traceable sourcing line.' },
  { number: '02', icon: RadarIcon, title: 'Research and reach out', body: 'Known suppliers come first. Research fills the gaps, then calls and emails move automatically.' },
  { number: '03', icon: CheckCircle2Icon, title: 'Compare and award', body: 'Commercial details, bids, and supplier status stay together until the final decision.' },
];

function WorkflowPreview() {
  const suppliers = [
    ['Apex Motion Systems', 'Local database', 'Call answered', 'Quote complete'],
    ['Pune Precision Works', 'Supplier research', 'Email sent', 'Awaiting bid'],
    ['Vector Components', 'Local database', 'Call queued', 'In progress'],
    ['Northstar Industrial', 'Supplier research', 'No answer', 'Email fallback'],
  ];
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-[0_30px_80px_color-mix(in_oklch,var(--foreground)_12%,transparent)]">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><BrandMark className="size-6 rounded-md" />Research</div>
        <Badge variant="secondary">Live sourcing</Badge>
      </div>
      <div className="grid min-h-[360px] md:grid-cols-[0.72fr_1.28fr]">
        <div className="border-b bg-secondary/35 p-5 md:border-r md:border-b-0">
          <p className="text-xs font-medium text-muted-foreground">BOM LINE 04</p>
          <h3 className="mt-3 text-xl font-semibold">Precision coolant pump</h3>
          <p className="mt-1 text-sm text-muted-foreground">1,000 Nos / Pune, Maharashtra</p>
          <div className="mt-8 flex flex-col gap-3">
            {['Database match', 'Supplier research', 'Voice outreach', 'Bid collection'].map((label, index) => (
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
          <div className="mb-5 flex items-center justify-between gap-4">
            <div><p className="text-sm font-semibold">Supplier shortlist</p><p className="text-xs text-muted-foreground">Ranked by fit and location</p></div>
            <span className="text-xs font-medium text-primary">5 found</span>
          </div>
          <div className="flex flex-col gap-2">
            {suppliers.map(([name, source, contact, status], index) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border bg-background/55 p-3"
              >
                <div className="min-w-0"><p className="truncate text-sm font-medium">{name}</p><p className="text-xs text-muted-foreground">{source}</p></div>
                <div className="text-right"><p className={cn('text-xs font-medium', index === 0 && 'text-primary')}>{contact}</p><p className="text-[11px] text-muted-foreground">{status}</p></div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="overflow-hidden bg-background py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-primary">One continuous workflow</p>
          <h2 className="mt-4 text-4xl leading-tight font-semibold tracking-normal md:text-5xl">Less coordination. More sourcing clarity.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">Every line moves through research, outreach, and bidding with a visible status. Your team always knows what happened and what needs attention.</p>
        </Reveal>
        <Reveal className="mx-auto mt-16 max-w-5xl"><WorkflowPreview /></Reveal>
        <div className="mt-20 grid gap-10 border-t pt-10 md:grid-cols-3">
          {workflow.map(({ number, icon: Icon, title, body }, index) => (
            <Reveal key={number} delay={index * 0.08}>
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{number}</span><Icon className="size-5 text-primary" /></div>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3><p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function VoiceSection() {
  return (
    <section id="voice" className="landing-inverse py-24 md:py-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 md:grid-cols-[0.85fr_1.15fr] md:items-center md:px-8">
        <Reveal>
          <div className="flex size-10 items-center justify-center rounded-lg border border-foreground/15 bg-foreground/5"><PhoneCallIcon className="size-5" /></div>
          <p className="mt-7 text-sm font-medium text-foreground/55">Voice sourcing</p>
          <h2 className="mt-4 max-w-lg text-4xl leading-tight font-semibold tracking-normal md:text-5xl">A supplier call that becomes structured commercial data.</h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-foreground/65">The agent asks for rate, MOQ, and lead time. Answered calls become reviewable details. Missed calls move to email without losing momentum.</p>
          <div className="mt-8 flex flex-col gap-3 text-sm text-foreground/75">
            <span className="flex items-center gap-2"><ShieldCheckIcon className="size-4 text-primary" />Auditable outcome and interaction history</span>
            <span className="flex items-center gap-2"><MailCheckIcon className="size-4 text-primary" />Automatic email fallback when needed</span>
          </div>
        </Reveal>
        <Reveal delay={0.1}><ProcurementVoiceDemo /></Reveal>
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
    <section className="border-t bg-secondary/30 py-24 text-center md:py-28">
      <Reveal className="mx-auto max-w-3xl px-5">
        <p className="text-sm font-medium text-primary">Ready to source</p>
        <h2 className="mt-4 text-4xl leading-tight font-semibold tracking-normal md:text-5xl">Start with the BOM already on your desk.</h2>
        <p className="mx-auto mt-5 max-w-xl text-muted-foreground">No workflow rebuild. Upload the request and let each line find its way to the right supplier.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
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
      <Hero /><OutcomeStrip /><WorkflowSection /><VoiceSection /><AudienceSection /><FinalCta />
      <footer className="border-t bg-background px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div><BrandLogo markClassName="size-6 rounded-md" /><p className="mt-2">Pune, Maharashtra, India</p></div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer navigation">
            <Link href="/status" className="hover:text-foreground hover:underline">Status</Link>
            <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link>
            <Link href="/contact" className="hover:text-foreground hover:underline">Contact</Link>
            <a href="mailto:support@vprocly.com" className="hover:text-foreground hover:underline">support@vprocly.com</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
