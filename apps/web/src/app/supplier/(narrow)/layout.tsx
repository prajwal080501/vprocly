import Link from 'next/link';
import { BrandLogo } from '@/components/brand';
import { AuroraBackground } from '@/components/illustrations';

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <AuroraBackground />
      <div className="flex w-full max-w-lg flex-col gap-5">
        <Link href="/" className="mx-auto">
          <BrandLogo animated markClassName="size-9" />
        </Link>
        {children}
      </div>
    </main>
  );
}
