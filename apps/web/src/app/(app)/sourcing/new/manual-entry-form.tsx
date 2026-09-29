'use client';

import { useState, useTransition } from 'react';
import { PlusIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryPicker } from '@/components/category-picker';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category } from '@/lib/types';
import { createManualSourcingRequest } from './actions';

type Row = {
  itemCode: string;
  brandManufacturer: string;
  hsnMfgCode: string;
  description: string;
  category: string;
  qty: string;
  uom: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string;
  inviteEmails: string;
};

const emptyRow = (): Row => ({ itemCode: '', brandManufacturer: '', hsnMfgCode: '', description: '', category: '', qty: '', uom: '', deliveryCity: '', deliveryState: '', needBy: '', inviteEmails: '' });

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
    <div className="flex flex-col gap-5">
      <Field><FieldLabel htmlFor="sourcing-title">Request title</FieldLabel><Input id="sourcing-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Plant expansion materials" /></Field>

      <div className="flex flex-col gap-4">
        {rows.map((row, i) => (
          <FieldGroup key={i} className="gap-4 rounded-lg border bg-background p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-secondary text-xs font-semibold">{i + 1}</span>
                <span className="text-sm font-medium">Line item</span>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" title="Remove item" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} disabled={rows.length === 1}>
                <Trash2Icon />
                <span className="sr-only">Remove item</span>
              </Button>
            </div>

            <Field>
              <FieldLabel>Item description</FieldLabel>
              <Input value={row.description} onChange={(e) => update(i, { description: e.target.value })} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Item code</FieldLabel>
                <Input placeholder="Internal code" value={row.itemCode} onChange={(e) => update(i, { itemCode: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel>Brand / Manufacturer</FieldLabel>
                <Input placeholder="e.g. Tata Steel" value={row.brandManufacturer} onChange={(e) => update(i, { brandManufacturer: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel>HSN / MFG Code</FieldLabel>
                <Input placeholder="HSN or manufacturer part code" value={row.hsnMfgCode} onChange={(e) => update(i, { hsnMfgCode: e.target.value })} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Category</FieldLabel>
                <CategoryPicker categories={categories} value={row.category ? [row.category] : []} onChange={(selected) => update(i, { category: selected[0] ?? '' })} />
                <FieldDescription>Choose the closest marketplace category for supplier matching.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Qty</FieldLabel>
                <Input type="number" min="0" step="any" value={row.qty} onChange={(e) => update(i, { qty: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel>Unit</FieldLabel>
                <Input placeholder="NOS, KG" value={row.uom} onChange={(e) => update(i, { uom: e.target.value })} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Delivery city</FieldLabel>
                <Input value={row.deliveryCity} onChange={(e) => update(i, { deliveryCity: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel>Delivery state</FieldLabel>
                <Input value={row.deliveryState} onChange={(e) => update(i, { deliveryState: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel>Need by</FieldLabel>
                <DatePicker value={row.needBy} onChange={(needBy) => update(i, { needBy })} />
              </Field>
            </div>

            <Field>
              <FieldLabel>Invite supplier emails</FieldLabel>
              <Input
                placeholder="Optional, comma-separated"
                value={row.inviteEmails}
                onChange={(e) => update(i, { inviteEmails: e.target.value })}
              />
            </Field>
          </FieldGroup>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-between border-t bg-background/95 px-6 py-4 backdrop-blur">
        <Button type="button" variant="outline" onClick={() => setRows((r) => [...r, emptyRow()])}>
          <PlusIcon data-icon="inline-start" />
          Add item
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !title || rows.some((r) => !r.description || !r.category || !r.qty || !r.uom || !r.deliveryCity || !r.deliveryState)}
        >
          <SendIcon data-icon="inline-start" />
          {pending ? 'Posting' : 'Post for sourcing'}
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
