'use client';

import { useActionState } from 'react';
import { CheckCircle2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { VoiceBidConfirmation } from '@/lib/types';
import { confirmVoiceBid, type ConfirmBidState } from './actions';

export function ConfirmationForm({ token, draft }: { token: string; draft: VoiceBidConfirmation }) {
  const [state, action, pending] = useActionState<ConfirmBidState, FormData>(confirmVoiceBid.bind(null, token), {});
  if (state.success || draft.status === 'confirmed') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2Icon className="size-10 text-emerald-500" />
        <h2 className="text-xl font-semibold">Bid confirmed</h2>
        <p className="text-sm text-muted-foreground">Your quote is now visible to the buyer.</p>
      </div>
    );
  }
  return (
    <form action={action}>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="voice-unit-price">Unit price</FieldLabel><Input id="voice-unit-price" name="unitPrice" type="number" min="0.01" step="0.01" defaultValue={draft.unitPrice ?? ''} required /></Field>
          <Field><FieldLabel htmlFor="voice-currency">Currency</FieldLabel><Input id="voice-currency" name="currency" maxLength={3} defaultValue={draft.currency || 'INR'} required /></Field>
          <Field><FieldLabel htmlFor="voice-moq">Minimum order quantity</FieldLabel><Input id="voice-moq" name="minimumOrderQty" type="number" min="0.001" step="0.001" defaultValue={draft.minimumOrderQty ?? ''} /></Field>
          <Field><FieldLabel htmlFor="voice-lead">Lead time (days)</FieldLabel><Input id="voice-lead" name="leadTimeDays" type="number" min="1" step="1" defaultValue={draft.leadTimeDays ?? ''} required /></Field>
          <Field><FieldLabel htmlFor="voice-tax">Tax (%)</FieldLabel><Input id="voice-tax" name="taxPercent" type="number" min="0" max="100" step="0.001" defaultValue={draft.taxPercent ?? ''} /></Field>
          <Field><FieldLabel htmlFor="voice-freight">Freight amount</FieldLabel><Input id="voice-freight" name="freightAmount" type="number" min="0" step="0.01" defaultValue={draft.freightAmount ?? ''} /></Field>
          <Field><FieldLabel htmlFor="voice-validity">Quote valid until</FieldLabel><Input id="voice-validity" name="quoteValidityDate" type="date" defaultValue={draft.quoteValidityDate ?? ''} /></Field>
        </div>
        <Field><FieldLabel htmlFor="voice-notes">Notes</FieldLabel><Input id="voice-notes" name="notes" defaultValue={draft.notes ?? ''} /></Field>
        {state.error && <FieldError>{state.error}</FieldError>}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? 'Confirming bid' : 'Confirm bid'}</Button>
      </FieldGroup>
    </form>
  );
}
