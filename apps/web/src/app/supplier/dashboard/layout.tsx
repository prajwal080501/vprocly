import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/brand';
import { ProfilePopover } from '@/components/profile-popover';
import { authOptions } from '@/lib/auth';
import { supplierApi } from '@/lib/supplier-api';
import type { SupplierMe } from '@/lib/types';
import { updateSupplierPhone } from './actions';

export default async function SupplierDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.error) redirect('/supplier/signin');
  if (session.accountKind === 'buyer') redirect('/home');
  const me = await supplierApi<SupplierMe>('/supplier/me');
  const initials = me.name.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 p-3 backdrop-blur-xl md:p-4">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between rounded-2xl border bg-background/90 px-3 py-2 shadow-md shadow-foreground/5">
          <BrandLogo animated markClassName="size-8" />
          <div className="rounded-lg bg-secondary px-5 py-2 text-sm font-medium">Opportunities</div>
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
            phone={me.phone}
            onUpdatePhone={updateSupplierPhone}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-3 md:px-6">{children}</main>
    </div>
  );
}
