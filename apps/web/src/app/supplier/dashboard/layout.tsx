import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/brand';
import { NotificationCenter } from '@/components/notification-center';
import { PageTransition } from '@/components/page-transition';
import { ProfilePopover } from '@/components/profile-popover';
import { ThemeToggle } from '@/components/theme-toggle';
import { authOptions } from '@/lib/auth';
import { supplierApi } from '@/lib/supplier-api';
import type { SupplierMe } from '@/lib/types';

export default async function SupplierDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.error) redirect('/supplier/signin');
  if (session.accountKind === 'buyer') redirect('/home');
  const me = await supplierApi<SupplierMe>('/supplier/me');
  const initials = me.name.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-muted/15">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-lg">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <BrandLogo animated markClassName="size-8" />
          <div className="hidden text-sm font-medium sm:block">Supplier workspace</div>
          <div className="flex items-center gap-2">
            <NotificationCenter audience="supplier" identityKey={me.id} />
            <ThemeToggle className="hidden sm:inline-flex" />
            <ProfilePopover
              name={me.name}
              subtitle="Supplier account"
              accountLabel="Verified supplier"
              initials={initials}
              callbackUrl="/supplier/signin"
              details={[
                { label: 'Email', value: me.email, icon: 'email' },
                { label: 'Location', value: [me.city, me.state, me.country].filter(Boolean).join(', '), icon: 'location' },
                { label: 'Wallet balance', value: `${me.walletBalance} points`, icon: 'balance' },
              ]}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 pb-12 pt-10 sm:px-6 lg:px-8 lg:pb-16 lg:pt-12">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
