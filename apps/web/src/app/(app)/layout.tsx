import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/brand';
import { Nav } from '@/components/nav';
import { ProfilePopover } from '@/components/profile-popover';
import { api } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import type { Me } from '@/lib/types';
import { updateBuyerPhone } from './profile-actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.error) redirect('/signin');
  if (session.accountKind === 'supplier') redirect('/supplier/dashboard');
  const me = await api<Me>('/me');
  const initials = (me.user.name ?? me.user.email ?? 'VP').slice(0, 2).toUpperCase();
  const role = me.user.roles.includes('tenant_admin') ? 'Workspace administrator' : 'Buyer';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 md:px-6">
          <Link href="/home" className="flex min-w-0 items-center gap-3">
            <BrandLogo animated className="hidden sm:inline-flex" markClassName="size-8" />
            <BrandLogo animated className="sm:hidden" markClassName="size-8 [&>span:last-child]:hidden" />
            <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:inline">{me.tenant.name}</span>
          </Link>
          <Nav />
          <ProfilePopover
            name={me.user.name ?? me.user.email ?? 'Buyer'}
            subtitle={me.tenant.name}
            accountLabel={role}
            initials={initials}
            callbackUrl="/signin"
            details={[
              { label: 'Email', value: me.user.email ?? 'Not provided', icon: 'email' },
              { label: 'Organization', value: me.tenant.name, icon: 'organization' },
              { label: 'Default currency', value: me.tenant.defaultCurrency, icon: 'balance' },
            ]}
            phone={me.user.phone}
            onUpdatePhone={updateBuyerPhone}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-3 md:px-6">{children}</main>
    </div>
  );
}
