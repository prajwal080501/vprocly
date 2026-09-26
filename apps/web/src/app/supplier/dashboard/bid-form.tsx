'use client';

import { useActionState } from 'react';
import type { OpenLineForSupplier } from '@/lib/types';
import { placeBid, type PlaceBidState } from './actions';

const input = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent';

export function BidForm({ line }: { line: OpenLineForSupplier }) {
  const action = placeBid.bind(null, line.sourcingLineId);
  const [state, formAction, pending] = useActionState<PlaceBidState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-3 grid grid-cols-[1fr_1fr_2fr_auto] items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-muted">Unit price</label>
        <input name="unitPrice" type="number" step="0.01" min="0" defaultValue={line.myUnitPrice ?? ''} className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">Lead time (days)</label>
        <input name="leadTimeDays" type="number" min="1" step="1" className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">Notes</label>
        <input name="notes" className={input} />
      </div>
      <button disabled={pending} className="h-[38px] rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-60">
        {pending ? '...' : line.alreadyBid ? 'Update bid' : 'Place bid'}
      </button>
      {state.error && <p className="col-span-4 text-sm text-danger">{state.error}</p>}
      {state.success && <p className="col-span-4 text-sm text-muted">Bid saved.</p>}
    </form>
  );
}
