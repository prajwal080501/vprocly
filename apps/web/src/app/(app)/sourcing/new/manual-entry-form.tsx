'use client';

import { useState, useTransition } from 'react';
import type { Category } from '@/lib/types';
import { createManualSourcingRequest } from './actions';

type Row = {
  description: string;
  categoryId: string;
  qty: string;
  uom: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string;
  inviteEmails: string;
};

const emptyRow = (): Row => ({ description: '', categoryId: '', qty: '', uom: '', deliveryCity: '', deliveryState: '', needBy: '', inviteEmails: '' });

const input = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent';

export function ManualEntryForm({ categories }: { categories: Category[] }) {
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createManualSourcingRequest({ title, lines: rows });
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Title</label>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Plant expansion materials" />
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-6">
            <input className={`${input} sm:col-span-2`} placeholder="Item description" value={row.description} onChange={(e) => update(i, { description: e.target.value })} />
            <select className={input} value={row.categoryId} onChange={(e) => update(i, { categoryId: e.target.value })}>
              <option value="">Category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input className={input} type="number" min="0" step="any" placeholder="Qty" value={row.qty} onChange={(e) => update(i, { qty: e.target.value })} />
            <input className={input} placeholder="Unit (NOS, KG…)" value={row.uom} onChange={(e) => update(i, { uom: e.target.value })} />
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              disabled={rows.length === 1}
              className="text-sm text-muted hover:text-danger disabled:opacity-30"
            >
              Remove
            </button>
            <input className={input} placeholder="Delivery city" value={row.deliveryCity} onChange={(e) => update(i, { deliveryCity: e.target.value })} />
            <input className={input} placeholder="Delivery state" value={row.deliveryState} onChange={(e) => update(i, { deliveryState: e.target.value })} />
            <input className={input} type="date" value={row.needBy} onChange={(e) => update(i, { needBy: e.target.value })} title="Need by (optional)" />
            <input
              className={`${input} sm:col-span-3`}
              placeholder="Invite specific supplier emails (optional, comma-separated)"
              value={row.inviteEmails}
              onChange={(e) => update(i, { inviteEmails: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setRows((r) => [...r, emptyRow()])} className="text-sm text-accent hover:underline">
          + Add another item
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !title || rows.some((r) => !r.description || !r.categoryId || !r.qty || !r.uom || !r.deliveryCity || !r.deliveryState)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {pending ? 'Posting…' : 'Post for sourcing'}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
