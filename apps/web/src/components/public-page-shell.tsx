import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonVariants } from '@/components/ui/button';

const legalLinks = [
  { href: '/status', label: 'Status' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
];

export function PublicPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 md:px-8">
          <Link href="/" aria-label="vProcly home"><BrandLogo markClassName="size-7" /></Link>
          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex" aria-label="Company navigation">
              {legalLinks.map((link) => <Link key={link.href} href={link.href} className="transition-colors hover:text-foreground">{link.label}</Link>)}
            </nav>
            <ThemeToggle />
            <Link href="/signin" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Sign in</Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div>
            <BrandLogo markClassName="size-6 rounded-md" />
            <p className="mt-2 text-xs">Pune, Maharashtra, India</p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal navigation">
            {legalLinks.map((link) => <Link key={link.href} href={link.href} className="hover:text-foreground hover:underline">{link.label}</Link>)}
            <a href="mailto:support@vprocly.com" className="hover:text-foreground hover:underline">support@vprocly.com</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function PublicPageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="border-b bg-secondary/30">
      <div className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-20">
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function LegalArticle({ children }: { children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 text-sm leading-7 text-muted-foreground md:px-8 md:py-16 [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_li]:pl-1 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      {children}
    </article>
  );
}
