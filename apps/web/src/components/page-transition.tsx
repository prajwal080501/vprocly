'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';

const APPLE_EASE = [0.22, 1, 0.36, 1] as const;

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={pathname}
        className="page-transition min-w-0"
        initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.995, filter: 'blur(3px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.998, filter: 'blur(2px)' }}
        transition={{ duration: reduceMotion ? 0 : 0.34, ease: APPLE_EASE }}
        style={{ transformOrigin: '50% 12%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
