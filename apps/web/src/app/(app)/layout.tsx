import { getServerSession } from 'next-auth';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/brand';
import { Nav } from '@/components/nav';
import { NotificationCenter } from '@/components/notification-center';
import { PageTransition } from '@/components/page-transition';
import { ProfilePopover } from '@/components/profile-popover';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import { isOperationsHost, mainAppUrl, operationsUrl } from '@/lib/public-urls';
import type { Me } from '@/lib/types';
import { updateBuyerPhone } from './profile-actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get('host');
  const operationsHost = isOperationsHost(host);
  const session = await getServerSession(authOptions);
  if (!session || session.error) {
    const callbackUrl = operationsHost ? operationsUrl() : `${mainAppUrl()}/home`;
    redirect(`${mainAppUrl()}/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  if (session.accountKind === 'supplier') redirect(`${mainAppUrl()}/supplier/dashboard`);
  const me = await api<Me>('/me');
  const initials = (me.user.name ?? me.user.email ?? 'VP').slice(0, 2).toUpperCase();
  const role = me.user.roles.includes('tenant_admin') ? 'Workspace administrator' : 'Buyer';

  return (
    <div className="min-h-screen bg-muted/15">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-lg">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-1 px-4 py-2 sm:gap-3 sm:px-6 lg:px-8">
          <Link href="/home" className="flex min-w-0 items-center gap-3">
            <BrandLogo animated className="hidden sm:inline-flex" markClassName="size-8" />
            <BrandLogo animated className="sm:hidden" markClassName="size-8" textClassName="hidden" />
            <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:inline">{me.tenant.name}</span>
          </Link>
          {operationsHost ? <span className="text-sm font-medium">Operations</span> : <Nav />}
          <div className="flex items-center gap-2">
            <NotificationCenter audience="buyer" identityKey={me.tenant.id} />
            <ThemeToggle className="hidden sm:inline-flex" />
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 pb-12 pt-10 sm:px-6 lg:px-8 lg:pb-16 lg:pt-12">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
