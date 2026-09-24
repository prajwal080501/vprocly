import { api } from '@/lib/api';
import type { Me, Supplier } from '@/lib/types';
import { CreateSupplierForm } from './create-supplier-form';

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [suppliers, me] = await Promise.all([
    api<Supplier[]>(`/suppliers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    api<Me>('/me'),
  ]);
  const canCreate = me.user.roles.some((r) => r === 'tenant_admin' || r === 'buyer');

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Suppliers</h1>
          <p className="text-sm text-muted">{suppliers.length} shown</p>
        </div>
        <form className="w-full sm:w-64">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name or code"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </form>
      </div>

      {canCreate && <CreateSupplierForm />}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">GSTIN</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{s.code}</td>
                <td className="px-4 py-2.5">{s.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{s.taxId ?? '—'}</td>
                <td className="px-4 py-2.5 text-muted">{s.sourceSystem}</td>
                <td className="px-4 py-2.5">{s.status}</td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
