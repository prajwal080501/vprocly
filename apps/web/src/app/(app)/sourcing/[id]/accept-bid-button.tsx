'use client';

import { useActionState, useEffect, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { acceptBid, type AcceptBidState } from './actions';

export function AcceptBidButton({ requestId, lineId, bidId, supplierName }: { requestId: string; lineId: string; bidId: string; supplierName: string }) {
  const action = acceptBid.bind(null, requestId, lineId, bidId);
  const [state, formAction, pending] = useActionState<AcceptBidState, FormData>(action, {});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <CheckIcon data-icon="inline-start" />
        Approve bid
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {supplierName}&apos;s bid?</DialogTitle>
          <DialogDescription>This closes the line, marks the other bids as not selected, reveals your organization to the winner, and creates a draft purchase order.</DialogDescription>
        </DialogHeader>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <form action={formAction}>
            <Button type="submit" disabled={pending}>
              <CheckIcon data-icon="inline-start" />
              {pending ? 'Approving' : 'Approve and award'}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
