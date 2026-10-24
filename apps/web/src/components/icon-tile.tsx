'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const tones = {
  primary: 'bg-primary/12 text-primary ring-primary/15',
  cyan: 'bg-chart-1/12 text-chart-1 ring-chart-1/15',
  green: 'bg-chart-2/12 text-chart-2 ring-chart-2/15',
  violet: 'bg-chart-3/12 text-chart-3 ring-chart-3/15',
  amber: 'bg-chart-4/14 text-chart-4 ring-chart-4/20',
  coral: 'bg-chart-5/12 text-chart-5 ring-chart-5/15',
  neutral: 'bg-secondary text-secondary-foreground ring-border',
} as const;

export type IconTileTone = keyof typeof tones;

export function IconTile({ icon: Icon, children, tone = 'primary', className }: { icon?: LucideIcon; children?: React.ReactNode; tone?: IconTileTone; className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      aria-hidden="true"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.82, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: -2, y: -1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset [&_svg]:size-4.5 [&_svg]:shrink-0', tones[tone], className)}
    >
      {Icon ? <Icon strokeWidth={1.8} /> : children}
    </motion.span>
  );
}
