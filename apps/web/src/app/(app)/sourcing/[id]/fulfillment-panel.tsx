'use client';

import { useActionState, useEffect, useState } from 'react';
import { CheckCircle2Icon, ClipboardCheckIcon, PlusIcon, TruckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PurchaseOrder } from '@/lib/types';
import { recordPurchaseOrderOutcome, type RecordOutcomeState } from './actions';

const OUTCOMES = ['acknowledged', 'dispatched', 'delivered', 'quality_accepted', 'quality_rejected', 'cancelled', 'disputed'] as const;
const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());

export function FulfillmentPanel({ requestId, lineId, order }: { requestId: string; lineId: string; order: PurchaseOrder }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof OUTCOMES)[number]>('acknowledged');
  const [state, action, pending] = useActionState<RecordOutcomeState, FormData>(recordPurchaseOrderOutcome.bind(null, requestId, lineId, order.id), {});
  useEffect(() => { if (state.success) setOpen(false); }, [state.success]);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between"><div><p className="text-xs text-muted-foreground">{order.poNumber}</p><CardTitle className="mt-1 text-base">{order.supplierName}</CardTitle></div><Badge>{label(order.status)}</Badge></CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{order.qty} {order.uom} · {order.currency} {order.unitPrice} per unit</p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" />}><PlusIcon data-icon="inline-start" />Record update</DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Record fulfillment update</DialogTitle><DialogDescription>Updates are append-only and become part of this supplier&apos;s delivery history.</DialogDescription></DialogHeader>
              <form action={action}><FieldGroup>
                <Field><FieldLabel>Outcome</FieldLabel><Select value={type} onValueChange={(value) => setType(value as typeof type)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{OUTCOMES.map((outcome) => <SelectItem key={outcome} value={outcome}>{label(outcome)}</SelectItem>)}</SelectGroup></SelectContent></Select><input type="hidden" name="type" value={type} /></Field>
                <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>Occurred at</FieldLabel><Input name="occurredAt" type="datetime-local" /></Field><Field><FieldLabel>Promised date</FieldLabel><Input name="promisedAt" type="datetime-local" /></Field><Field><FieldLabel>Quantity</FieldLabel><Input name="quantity" type="number" min="0" step="0.001" /></Field><Field><FieldLabel>Rating</FieldLabel><Input name="rating" type="number" min="1" max="5" step="1" /></Field></div>
                <Field><FieldLabel>Reason code</FieldLabel><Input name="reasonCode" placeholder="Optional structured reason" /></Field><Field><FieldLabel>Notes</FieldLabel><Input name="notes" /></Field>
                {state.error && <FieldError>{state.error}</FieldError>}<DialogFooter><Button type="submit" disabled={pending}>{pending ? 'Recording' : 'Record update'}</Button></DialogFooter>
              </FieldGroup></form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-lg border">
        {order.outcomes.length ? order.outcomes.map((outcome) => <div key={outcome.id} className="flex gap-3 border-b px-4 py-3 last:border-0"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">{outcome.type === 'delivered' ? <TruckIcon className="size-4" /> : outcome.type.startsWith('quality_') ? <ClipboardCheckIcon className="size-4" /> : <CheckCircle2Icon className="size-4" />}</span><div><p className="text-sm font-medium">{label(outcome.type)}</p><p className="text-xs text-muted-foreground">{new Date(outcome.occurredAt).toLocaleString()}{outcome.quantity ? ` · ${outcome.quantity} ${order.uom}` : ''}{outcome.rating ? ` · ${outcome.rating}/5` : ''}</p>{outcome.notes && <p className="mt-1 text-sm text-muted-foreground">{outcome.notes}</p>}</div></div>) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">No fulfillment updates recorded yet.</p>}
      </div>
    </div>
  );
}
