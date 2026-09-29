'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRightIcon } from 'lucide-react';
import { SceneIllustration } from '@/components/illustrations';

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export function AudienceSplit() {
  return (
    <section className="border-t bg-background py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-16 px-6 md:grid-cols-2 md:px-10">
        <motion.div {...fadeUp} className="flex flex-col">
          <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">FOR BUYERS</span>
          <h3 className="mt-4 text-3xl font-medium tracking-tight md:text-[2.5rem]">Post a request in the time it takes to open the file.</h3>
          <p className="mt-4 max-w-md text-muted-foreground">
            No approval matrices to configure before you can send a single RFQ. Upload, review the parsed lines, and it's already routed.
          </p>
          <SceneIllustration variant="buyer" className="mt-8 justify-start" />
          <Link href="/signup" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
            Create your organisation <ArrowUpRightIcon className="size-3.5" />
          </Link>
        </motion.div>

        <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="flex flex-col md:border-l md:pl-16">
          <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">FOR SUPPLIERS</span>
          <h3 className="mt-4 text-3xl font-medium tracking-tight md:text-[2.5rem]">Get invited to bid on work you'd never have seen.</h3>
          <p className="mt-4 max-w-md text-muted-foreground">
            Register once against the categories you actually make or supply. 1,000 points to bid with on day one — no subscription, no cold outreach.
          </p>
          <SceneIllustration variant="supplier" className="mt-8 justify-start" />
          <Link href="/supplier/signup" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
            Register as a supplier <ArrowUpRightIcon className="size-3.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
