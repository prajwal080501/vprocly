'use client';

import { useState, useTransition } from 'react';
import { ChevronDownIcon, MapPinIcon, PlusIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryPicker } from '@/components/category-picker';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category, CustomRequestOption } from '@/lib/types';
import { suggestUnits, unitOptions } from '@/lib/unit-suggestions';
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

type DeliveryDefaults = Pick<Row, 'deliveryCity' | 'deliveryState' | 'needBy'>;

const emptyDelivery: DeliveryDefaults = { deliveryCity: '', deliveryState: '', needBy: '' };
const emptyRow = (delivery: DeliveryDefaults = emptyDelivery): Row => ({
  itemCode: '',
  brandManufacturer: '',
  hsnMfgCode: '',
  description: '',
  category: '',
  qty: '',
  uom: '',
  ...delivery,
  inviteEmails: '',
});

export function ManualEntryForm({ categories, customRequests = [] }: { categories: Category[]; customRequests?: CustomRequestOption[] }) {
  const [title, setTitle] = useState('');
  const [delivery, setDelivery] = useState<DeliveryDefaults>(emptyDelivery);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedRequest = customRequests.find((request) => request.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase());

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const updateDelivery = (field: keyof DeliveryDefaults, value: string) => {
    const previous = delivery[field];
    setDelivery((current) => ({ ...current, [field]: value }));
    setRows((current) => current.map((row) => (row[field] === previous || !row[field] ? { ...row, [field]: value } : row)));
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createManualSourcingRequest({ title, sourcingRequestId: selectedRequest?.id, lines: rows });
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Request details</CardTitle>
          <CardDescription>Set the destination once. It will be applied to every item unless you override it.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="sourcing-title">Request</FieldLabel>
              <Input id="sourcing-title" list="custom-request-options" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Select an open request or enter a new name" autoComplete="off" />
              <datalist id="custom-request-options">{customRequests.map((request) => <option key={request.id} value={request.title}>{request.lineCount} existing items</option>)}</datalist>
              <FieldDescription>{selectedRequest ? <Badge variant="secondary">Adding to {selectedRequest.title} · {selectedRequest.lineCount} items</Badge> : title.trim() ? <Badge variant="outline">New custom request</Badge> : 'Open requests appear as you type.'}</FieldDescription>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="default-delivery-city">Delivery city</FieldLabel>
                <Input id="default-delivery-city" value={delivery.deliveryCity} onChange={(e) => updateDelivery('deliveryCity', e.target.value)} placeholder="e.g. Pune" />
              </Field>
              <Field>
                <FieldLabel htmlFor="default-delivery-state">Delivery state</FieldLabel>
                <Input id="default-delivery-state" value={delivery.deliveryState} onChange={(e) => updateDelivery('deliveryState', e.target.value)} placeholder="e.g. Maharashtra" />
              </Field>
              <Field>
                <FieldLabel>Need by</FieldLabel>
                <DatePicker value={delivery.needBy} onChange={(needBy) => updateDelivery('needBy', needBy)} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {rows.map((row, i) => {
          const optionalDetailCount = [row.itemCode, row.brandManufacturer, row.hsnMfgCode, row.inviteEmails].filter(Boolean).length
            + (row.deliveryCity !== delivery.deliveryCity || row.deliveryState !== delivery.deliveryState || row.needBy !== delivery.needBy ? 1 : 0);
          return (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="secondary">{i + 1}</Badge>
                  {row.description || 'New item'}
                </CardTitle>
                <CardDescription>Describe what you need, then choose how suppliers should match it.</CardDescription>
                <CardAction>
                  <Button type="button" variant="ghost" size="icon-sm" title="Remove item" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} disabled={rows.length === 1}>
                    <Trash2Icon />
                    <span className="sr-only">Remove item</span>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`description-${i}`}>Item description</FieldLabel>
                    <Input id={`description-${i}`} value={row.description} placeholder="e.g. 10 mm mild steel plate" onChange={(e) => {
                      const description = e.target.value;
                      const previousSuggestion = suggestUnits(row.description)[0]?.value;
                      const nextSuggestion = suggestUnits(description)[0]?.value;
                      const mayReplaceUnit = !row.uom || row.uom === previousSuggestion;
                      update(i, { description, ...(mayReplaceUnit && nextSuggestion ? { uom: nextSuggestion } : {}) });
                    }} />
                  </Field>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(7rem,0.6fr)_minmax(8rem,0.8fr)]">
                    <Field>
                      <FieldLabel>Category</FieldLabel>
                      <CategoryPicker categories={categories} value={row.category ? [row.category] : []} onChange={(selected) => update(i, { category: selected[0] ?? '' })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`qty-${i}`}>Quantity</FieldLabel>
                      <Input id={`qty-${i}`} type="number" min="0" step="any" value={row.qty} onChange={(e) => update(i, { qty: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`unit-${i}`}>Unit</FieldLabel>
                      <Input id={`unit-${i}`} list={`unit-options-${i}`} placeholder="NOS, KG…" value={row.uom} onChange={(e) => update(i, { uom: e.target.value.toUpperCase() })} autoComplete="off" />
                      <datalist id={`unit-options-${i}`}>{unitOptions(row.description).map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</datalist>
                    </Field>
                  </div>

                  <details className="group rounded-lg border px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                      <span className="flex items-center gap-2">
                        More details
                        {optionalDetailCount > 0 && <Badge variant="outline">{optionalDetailCount} added</Badge>}
                      </span>
                      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <FieldGroup className="mt-4 gap-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Field>
                          <FieldLabel htmlFor={`item-code-${i}`}>Item code</FieldLabel>
                          <Input id={`item-code-${i}`} placeholder="Optional internal code" value={row.itemCode} onChange={(e) => update(i, { itemCode: e.target.value })} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`brand-${i}`}>Brand / manufacturer</FieldLabel>
                          <Input id={`brand-${i}`} placeholder="Optional" value={row.brandManufacturer} onChange={(e) => update(i, { brandManufacturer: e.target.value })} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`hsn-${i}`}>HSN / MFG code</FieldLabel>
                          <Input id={`hsn-${i}`} placeholder="Optional" value={row.hsnMfgCode} onChange={(e) => update(i, { hsnMfgCode: e.target.value })} />
                        </Field>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MapPinIcon className="size-4 text-muted-foreground" />
                        Override delivery for this item
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Field>
                          <FieldLabel htmlFor={`delivery-city-${i}`}>Delivery city</FieldLabel>
                          <Input id={`delivery-city-${i}`} value={row.deliveryCity} onChange={(e) => update(i, { deliveryCity: e.target.value })} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`delivery-state-${i}`}>Delivery state</FieldLabel>
                          <Input id={`delivery-state-${i}`} value={row.deliveryState} onChange={(e) => update(i, { deliveryState: e.target.value })} />
                        </Field>
                        <Field>
                          <FieldLabel>Need by</FieldLabel>
                          <DatePicker value={row.needBy} onChange={(needBy) => update(i, { needBy })} />
                        </Field>
                      </div>

                      <Field>
                        <FieldLabel htmlFor={`invite-emails-${i}`}>Invite specific suppliers</FieldLabel>
                        <Input id={`invite-emails-${i}`} placeholder="Optional email addresses, separated by commas" value={row.inviteEmails} onChange={(e) => update(i, { inviteEmails: e.target.value })} />
                        <FieldDescription>Use this only when you already know which suppliers should receive this item.</FieldDescription>
                      </Field>
                    </FieldGroup>
                  </details>
                </FieldGroup>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-between border-t bg-background/95 px-6 py-4 backdrop-blur">
        <Button type="button" variant="outline" onClick={() => setRows((r) => [...r, emptyRow(delivery)])}>
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
