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
    <nav className="flex rounded-lg bg-secondary p-1">
      {NAV.map((item) => {
        const active = path === item.href || path.startsWith(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              buttonVariants({ variant: active ? 'outline' : 'ghost', size: 'sm' }),
              'min-w-24 border-transparent px-4 shadow-none',
              active && 'bg-background shadow-xs',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
