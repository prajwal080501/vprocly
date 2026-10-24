'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { label: 'Source', href: '/home' },
  { label: 'Requests', href: '/sourcing' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="Primary navigation">
      {NAV.map((item) => {
        const active = path === item.href || path.startsWith(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              buttonVariants({ variant: active ? 'outline' : 'ghost', size: 'sm' }),
              'min-w-20 border-transparent px-3 shadow-none transition-colors sm:min-w-24 sm:px-4',
              active && 'border-border bg-background shadow-xs',
            )}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
