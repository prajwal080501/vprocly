'use client';

import { useActionState, useEffect, useState } from 'react';
import { GavelIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { OpenLineForSupplier } from '@/lib/types';
import { placeBid, type PlaceBidState } from './actions';

export function BidForm({ line }: { line: OpenLineForSupplier }) {
  const action = placeBid.bind(null, line.sourcingLineId);
  const [state, formAction, pending] = useActionState<PlaceBidState, FormData>(action, {});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <GavelIcon data-icon="inline-start" />
        {line.alreadyBid ? 'Update bid' : 'Place bid'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{line.alreadyBid ? 'Update your bid' : 'Place a bid'}</DialogTitle>
          <DialogDescription>{line.description} · {line.qty} {line.uom}</DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`unit-price-${line.sourcingLineId}`}>Unit price</FieldLabel>
          <Input id={`unit-price-${line.sourcingLineId}`} name="unitPrice" type="number" step="0.01" min="0" defaultValue={line.myUnitPrice ?? ''} required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`minimum-order-qty-${line.sourcingLineId}`}>Minimum order quantity</FieldLabel>
          <Input id={`minimum-order-qty-${line.sourcingLineId}`} name="minimumOrderQty" type="number" min="0.001" step="any" defaultValue={line.myMinimumOrderQty ?? ''} placeholder={line.uom} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`lead-time-${line.sourcingLineId}`}>Lead time</FieldLabel>
          <Input id={`lead-time-${line.sourcingLineId}`} name="leadTimeDays" type="number" min="1" step="1" placeholder="Days" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`notes-${line.sourcingLineId}`}>Notes</FieldLabel>
          <Input id={`notes-${line.sourcingLineId}`} name="notes" />
        </Field>
            {state.error && <FieldError>{state.error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={pending}>{pending ? 'Saving' : line.alreadyBid ? 'Update bid' : 'Submit bid'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
