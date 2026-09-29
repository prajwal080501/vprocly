'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';

const STEPS = [
  {
    kicker: '01 — Upload',
    title: 'Drop in the BOM.',
    body: 'A buyer uploads the same messy Excel sheet they already have — no template migration, no cleanup pass. We parse it, find the true header row, and line-item everything.',
  },
  {
    kicker: '02 — Match',
    title: 'Matched instantly. Or found from scratch.',
    body: "Every line resolves to a category on its own — nothing is hand-seeded. If a supplier already fits, they're invited in seconds. If none exist yet, real candidates get researched and added to the pool, growing it for the next request.",
  },
  {
    kicker: '03 — Bid',
    title: 'Bids come in blind.',
    body: 'Suppliers never see who they’re bidding against or who the buyer is until an award is made. Price competes on its own terms.',
  },
  {
    kicker: '04 — Award',
    title: 'You award. We keep the trail.',
    body: 'Every match, invite, and bid is logged the moment it happens — not reconstructed later from memory.',
  },
];

function StepVisual({ index }: { index: number }) {
  return (
    <div className="relative flex aspect-square w-full max-w-md items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
      <AnimatePresence mode="wait">
        {index === 0 && (
          <motion.div key={0} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col gap-2">
            {[92, 78, 85, 64, 90].map((w, i) => (
              <motion.div
                key={i}
                initial={{ scaleX: 0.3, opacity: 0.3 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                style={{ width: `${w}%`, originX: 0 }}
                className="h-3 rounded-full bg-white/15"
              />
            ))}
          </motion.div>
        )}
        {index === 1 && (
          <motion.div key={1} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative size-full">
            <svg viewBox="0 0 200 200" className="size-full">
              <circle cx="100" cy="100" r="8" fill="white" fillOpacity="0.5" />
              {[
                [40, 60],
                [160, 55],
                [50, 150],
                [155, 145],
              ].map(([x, y], i) => (
                <g key={i}>
                  <line x1="100" y1="100" x2={x} y2={y} stroke="white" strokeOpacity="0.15" />
                  <circle cx={x} cy={y} r="6" fill="white" fillOpacity={i === 3 ? '0.9' : '0.35'} />
                  {i === 3 && (
                    <motion.circle
                      cx={x}
                      cy={y}
                      r="6"
                      fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                      initial={{ opacity: 0.8, scale: 1 }}
                      animate={{ opacity: 0, scale: 3.2 }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}
                </g>
              ))}
            </svg>
          </motion.div>
        )}
        {index === 2 && (
          <motion.div key={2} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col gap-3">
            {['₹4,20,000', '₹3,95,000', '₹4,05,000'].map((price, i) => (
              <motion.div
                key={price}
                initial={{ x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.12 }}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="h-3 w-20 rounded-full bg-white/20" />
                <span className="font-mono text-sm text-white/70">{price}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
        {index === 3 && (
          <motion.div key={3} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
            <div className="flex size-20 items-center justify-center rounded-full bg-[var(--color-primary)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex flex-col gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.3 + i * 0.15 }} className="h-2 w-40 rounded-full bg-white/20" />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = Math.min(STEPS.length - 1, Math.floor(v * STEPS.length));
    setActive(next);
  });

  const railProgress = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section ref={containerRef} className="relative bg-[#07070a] text-white" style={{ height: `${STEPS.length * 100}vh` }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 md:grid-cols-[minmax(0,1fr)_auto] md:px-10">
          <div className="order-2 flex flex-col gap-8 md:order-1">
            <div className="relative h-1 w-16 overflow-hidden rounded-full bg-white/15">
              <motion.div className="absolute inset-y-0 left-0 bg-white" style={{ width: railProgress }} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4 }}>
                <p className="font-mono text-xs tracking-[0.2em] text-white/50">{STEPS[active]!.kicker}</p>
                <h3 className="mt-3 max-w-md text-3xl font-medium tracking-tight md:text-4xl">{STEPS[active]!.title}</h3>
                <p className="mt-4 max-w-md text-base leading-relaxed text-white/60">{STEPS[active]!.body}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="order-1 md:order-2">
            <StepVisual index={active} />
          </div>
        </div>
      </div>
    </section>
  );
}
