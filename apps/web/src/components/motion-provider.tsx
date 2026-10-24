'use client';

import { MotionConfig } from 'framer-motion';

const APPLE_EASE = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: APPLE_EASE }}>
      {children}
    </MotionConfig>
  );
}
