import Link from 'next/link';
import { BrandLogo } from '@/components/brand';
import { AuroraBackground } from '@/components/illustrations';
import { PageTransition } from '@/components/page-transition';
import { ThemeToggle } from '@/components/theme-toggle';

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <AuroraBackground />
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="flex w-full max-w-lg flex-col gap-5">
        <Link href="/" className="mx-auto">
          <BrandLogo animated markClassName="size-9" />
        </Link>
        <PageTransition>{children}</PageTransition>
      </div>
    </main>
  );
}
