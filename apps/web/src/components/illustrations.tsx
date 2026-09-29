import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';

/** Soft blurred color washes behind a page's content -- gives translucent cards something to blur
 *  against instead of a flat backdrop. Pure CSS, adapts to dark mode via the primary/accent tokens. */
export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)}>
      <div className="absolute -top-28 -left-20 size-72 rounded-full bg-primary/25 blur-3xl" />
      <div className="absolute top-1/2 -right-24 size-80 rounded-full bg-accent/40 blur-3xl" />
      <div className="absolute -bottom-32 left-1/4 size-72 rounded-full bg-primary/15 blur-3xl" />
    </div>
  );
}

/** A small flat-geometric scene -- overlapping rounded cards/badges in the primary/accent palette, with a
 *  soft glow behind. Used above auth-page headers so the sign-in/sign-up cards read as designed rather than
 *  bare forms. Everything is drawn from CSS-variable colors, so it tracks light/dark automatically. */
export function SceneIllustration({ variant, className }: { variant: 'buyer' | 'supplier'; className?: string }) {
  return (
    <div className={cn('relative flex h-32 items-center justify-center', className)}>
      <div className="absolute size-28 rounded-full bg-primary/20 blur-2xl" />
      <div className="absolute right-6 top-2 size-16 rounded-full bg-accent/50 blur-xl" />
      <svg width="176" height="128" viewBox="0 0 176 128" fill="none" className="relative">
        {variant === 'buyer' ? (
          <>
            <rect x="16" y="46" width="72" height="56" rx="14" transform="rotate(-6 52 74)" fill="var(--color-primary)" opacity="0.14" />
            <rect x="58" y="22" width="86" height="66" rx="16" transform="rotate(4 101 55)" fill="var(--color-card)" stroke="var(--color-border)" />
            <g transform="rotate(4 101 55)">
              <rect x="74" y="40" width="46" height="5" rx="2.5" fill="var(--color-muted-foreground)" opacity="0.55" />
              <rect x="74" y="52" width="34" height="5" rx="2.5" fill="var(--color-muted-foreground)" opacity="0.4" />
              <rect x="74" y="64" width="26" height="5" rx="2.5" fill="var(--color-primary)" opacity="0.7" />
            </g>
            <circle cx="140" cy="30" r="18" fill="var(--color-primary)" />
            <path d="M133 30l4.5 4.5L148 24" stroke="var(--color-primary-foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="26" cy="24" r="3" fill="var(--color-accent-foreground)" opacity="0.5" />
            <circle cx="150" cy="88" r="4" fill="var(--color-primary)" opacity="0.35" />
          </>
        ) : (
          <>
            <circle cx="66" cy="60" r="42" fill="var(--color-primary)" opacity="0.16" />
            <circle cx="112" cy="60" r="42" fill="var(--color-accent)" opacity="0.5" />
            <circle cx="89" cy="60" r="20" fill="var(--color-primary)" />
            <path d="M81 60a8 8 0 0 1 16 0" stroke="var(--color-primary-foreground)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <circle cx="89" cy="55" r="2.6" fill="var(--color-primary-foreground)" />
            <circle cx="28" cy="30" r="3" fill="var(--color-accent-foreground)" opacity="0.5" />
            <circle cx="150" cy="94" r="4" fill="var(--color-primary)" opacity="0.3" />
            <circle cx="150" cy="26" r="3.5" fill="var(--color-primary)" opacity="0.4" />
          </>
        )}
      </svg>
    </div>
  );
}

/** A small icon-in-a-glow badge for empty table/list states -- lighter-weight than SceneIllustration. */
export function EmptyStateIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cn('relative mx-auto flex size-14 items-center justify-center', className)}>
      <div className="absolute size-14 rounded-full bg-primary/15 blur-lg" />
      <div className="relative flex size-11 items-center justify-center rounded-2xl border bg-card">
        <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} />
      </div>
    </div>
  );
}
