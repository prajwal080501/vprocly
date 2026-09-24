import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Nav } from '@/components/nav';
import { SignOutButton } from '@/components/sign-in-button';
import { api } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import type { Me } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.error) redirect('/signin');
  const me = await api<Me>('/me');

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-border bg-surface p-4 md:min-h-screen md:border-r md:border-b-0">
        <div className="mb-4 px-3">
          <div className="font-semibold">vProcly</div>
          <div className="truncate text-xs text-muted">{me.tenant.name}</div>
        </div>
        <Nav />
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-end gap-4 border-b border-border px-4 py-3 md:px-8">
          <span className="truncate text-sm text-muted">{me.user.name ?? me.user.email}</span>
          <SignOutButton />
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
