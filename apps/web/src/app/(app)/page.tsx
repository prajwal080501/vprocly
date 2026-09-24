import { api } from '@/lib/api';
import type { Me } from '@/lib/types';

export default async function OverviewPage() {
  const me = await api<Me>('/me');
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Welcome, {me.user.name ?? 'there'}</h1>
      <p className="mt-1 text-sm text-muted">
        {me.tenant.name} · roles: {me.user.roles.join(', ') || 'none'}
      </p>
      <div className="mt-6 rounded-xl border border-border bg-surface p-5 text-sm">
        <p className="font-medium">Platform foundation is live</p>
        <p className="mt-1 text-muted">
          Tenant isolation, audit trail, events and document storage are running. Excel imports arrive next, followed by
          requests, sourcing, purchase orders, budgets and ExceptionOS.
        </p>
      </div>
    </div>
  );
}
