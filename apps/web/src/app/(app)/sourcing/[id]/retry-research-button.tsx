'use client';

import { useActionState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { retryResearch, type RetryResearchState } from './actions';

export function RetryResearchButton({ requestId, lineId }: { requestId: string; lineId: string }) {
  const action = retryResearch.bind(null, requestId, lineId);
  const [state, formAction, pending] = useActionState<RetryResearchState, FormData>(action, {});

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <RefreshCwIcon data-icon="inline-start" className={pending ? 'animate-spin' : undefined} />
          {pending ? 'Queueing' : 'Retry research'}
        </Button>
      </form>
      {state.error && <p className="max-w-64 text-right text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
