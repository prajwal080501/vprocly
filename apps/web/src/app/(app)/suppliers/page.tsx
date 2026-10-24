import { SearchIcon, ShieldCheckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyStateIcon } from '@/components/illustrations';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="page-heading">Suppliers</h1><p className="page-description">Manage the approved supplier directory for {me.tenant.name}.</p></div>
        {canCreate && <CreateSupplierForm />}
      </header>
      <Card className="shadow-none">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>Supplier directory</CardTitle>
          <CardDescription>{suppliers.length} suppliers in this tenant catalog</CardDescription>
          <CardAction><form className="relative w-72 max-w-full"><SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input name="q" defaultValue={q} placeholder="Search name or code" className="pl-8" /></form></CardAction>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="px-4 font-mono text-xs">{s.code}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{s.taxId ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground">{s.sourceSystem}</TableCell>
                <TableCell><Badge variant="secondary"><ShieldCheckIcon data-icon="inline-start" />{s.status}</Badge></TableCell>
              </TableRow>
            ))}
            {suppliers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-40 px-4 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <EmptyStateIcon icon={ShieldCheckIcon} />
                    <p className="text-sm text-muted-foreground">No suppliers yet.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
