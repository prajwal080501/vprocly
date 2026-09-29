import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

type BrandMarkProps = ComponentPropsWithoutRef<'span'> & {
  animated?: boolean;
  markClassName?: string;
  textClassName?: string;
};

export function BrandMark({ animated = false, className, markClassName, ...props }: BrandMarkProps) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm',
        animated && 'brand-mark-auth',
        className,
      )}
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        fill="none"
        className={cn('size-[72%]', markClassName)}
      >
        <circle className="brand-mark-dot" cx="6.5" cy="7.5" r="1.7" fill="currentColor" />
        <circle className="brand-mark-dot" cx="6.5" cy="16" r="1.7" fill="currentColor" />
        <circle className="brand-mark-dot" cx="6.5" cy="24.5" r="1.7" fill="currentColor" />
        <path className="brand-mark-line" d="M9.5 7.5h3.2c2.4 0 3.8 1 5 2.7l2 2.9" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
        <path className="brand-mark-line" d="M9.5 16h5.2c1.8 0 3 .7 4.1 2l1 1.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
        <path className="brand-mark-line" d="M9.5 24.5h3.2c2.4 0 3.8-1 5-2.7l1.4-1.9" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
        <path className="brand-mark-check" d="m17.8 17.5 3.4 3.4 5.3-9.2" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function BrandLogo({ animated = false, className, markClassName, textClassName, ...props }: BrandMarkProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)} {...props}>
      <BrandMark animated={animated} className={markClassName} />
      <span className={cn('truncate text-base font-semibold tracking-normal text-foreground', animated && 'brand-word-auth', textClassName)}>vProcly</span>
    </span>
  );
}
