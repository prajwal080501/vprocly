'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Items without href are planned for later sprints and shown disabled so the product shape is visible.
const NAV: { label: string; href?: string; sprint?: string }[] = [
  { label: 'Overview', href: '/' },
  { label: 'Sourcing', href: '/sourcing' },
  { label: 'Imports', sprint: 'S1' },
  { label: 'Requests', sprint: 'S3' },
  { label: 'Purchase orders', sprint: 'S5' },
  { label: 'Budgets', sprint: 'S3' },
  { label: 'Exceptions', sprint: 'S6' },
  { label: 'Suppliers', href: '/suppliers' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {NAV.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${
              path === item.href || (item.href !== '/' && path.startsWith(item.href))
                ? 'bg-surface-2 font-medium'
                : 'text-muted hover:bg-surface-2 hover:text-text'
            }`}
          >
            {item.label}
          </Link>
        ) : (
          <span key={item.label} className="flex items-center justify-between gap-2 whitespace-nowrap px-3 py-2 text-sm text-muted/60">
            {item.label}
            <span className="rounded bg-surface-2 px-1.5 text-[10px]">{item.sprint}</span>
          </span>
        ),
      )}
    </nav>
  );
}
