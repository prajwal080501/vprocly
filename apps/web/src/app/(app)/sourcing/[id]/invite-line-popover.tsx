'use client';

import { useActionState, useEffect, useState } from 'react';
import { UserPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { inviteToLine, type InviteToLineState } from './actions';

export function InviteLinePopover({ requestId, lineId, description }: { requestId: string; lineId: string; description: string }) {
  const action = inviteToLine.bind(null, requestId, lineId);
  const [state, formAction, pending] = useActionState<InviteToLineState, FormData>(action, {});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <UserPlusIcon data-icon="inline-start" />
        Invite supplier
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle className="truncate" title={description}>Invite for {description}</PopoverTitle>
          <PopoverDescription>Never reveals your company identity.</PopoverDescription>
        </PopoverHeader>
        <form action={formAction} className="flex flex-col gap-2.5">
          <Field>
            <FieldLabel htmlFor={`invite-emails-${lineId}`}>Supplier emails</FieldLabel>
            <Input id={`invite-emails-${lineId}`} name="emails" placeholder="a@co.com, b@co.com" />
            <FieldDescription>Comma-separated.</FieldDescription>
            {state.error && <FieldError>{state.error}</FieldError>}
          </Field>
          <Button type="submit" disabled={pending} className="w-full" size="sm">{pending ? 'Sending' : 'Send invites'}</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
