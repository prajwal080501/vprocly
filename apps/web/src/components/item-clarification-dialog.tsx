'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { MessageSquareTextIcon, SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { ItemClarificationMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

type State = { error?: string; success?: boolean };
type SendAction = (previous: State, formData: FormData) => Promise<State>;

function messageTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function ItemClarificationDialog({
  title,
  description,
  messages,
  currentParty,
  sendAction,
}: {
  title: string;
  description: string;
  messages: ItemClarificationMessage[];
  currentParty: 'buyer' | 'supplier';
  sendAction: SendAction;
}) {
  const [state, formAction, pending] = useActionState(sendAction, {});
  const messageId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <MessageSquareTextIcon data-icon="inline-start" />
        Clarify
        {messages.length > 0 && <span className="text-xs text-muted-foreground">{messages.length}</span>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-80 min-h-48 flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
          {messages.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageSquareTextIcon className="size-5" />
              <p className="text-sm">No clarification messages yet.</p>
              <p className="max-w-xs text-xs">Keep product, delivery, and commercial questions attached to this item.</p>
            </div>
          ) : messages.map((message) => {
            const own = message.senderType === currentParty;
            return (
              <article key={message.id} className={cn('flex max-w-[88%] flex-col gap-1', own ? 'self-end items-end' : 'self-start items-start')}>
                <div className={cn('rounded-lg px-3 py-2 text-sm leading-relaxed', own ? 'bg-primary text-primary-foreground' : 'border bg-background')}>
                  {message.body}
                </div>
                <p className="px-1 text-xs text-muted-foreground">{own ? 'You' : message.senderLabel} · {messageTime(message.createdAt)}</p>
              </article>
            );
          })}
          <div ref={endRef} />
        </div>

        <form ref={formRef} action={formAction}>
          <Field data-invalid={Boolean(state.error)}>
            <FieldLabel htmlFor={messageId}>Message</FieldLabel>
            <Textarea
              id={messageId}
              name="message"
              maxLength={2000}
              rows={3}
              placeholder="Ask about specifications, alternatives, delivery, or commercial terms"
              aria-invalid={Boolean(state.error)}
              required
            />
            {state.error && <FieldError>{state.error}</FieldError>}
          </Field>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={pending}>
              <SendIcon data-icon="inline-start" />
              {pending ? 'Sending' : 'Send message'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
