'use client';

import { useActionState } from 'react';
import { MailIcon, PhoneIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { manualCall, manualEmail, type ManualOutreachState } from './actions';

/** "Email" and "Call" buttons on a supplier row -- unlike the automatic pipeline (which obeys
 *  EMAIL_DELIVERY_MODE / VOICE_DELIVERY_MODE), these always go out for real. See sourcing.service.ts's
 *  manualEmail/manualCall. */
export function ManualOutreachButtons({ requestId, lineId, notificationId, hasPhone }: { requestId: string; lineId: string; notificationId: string; hasPhone: boolean }) {
  const emailAction = manualEmail.bind(null, requestId, lineId, notificationId);
  const callAction = manualCall.bind(null, requestId, lineId, notificationId);
  const [emailState, emailFormAction, emailPending] = useActionState<ManualOutreachState, FormData>(emailAction, {});
  const [callState, callFormAction, callPending] = useActionState<ManualOutreachState, FormData>(callAction, {});

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <form action={emailFormAction}>
          <Button type="submit" variant="outline" size="icon-sm" disabled={emailPending} title="Send the invite email now, for real">
            <MailIcon className={emailPending ? 'animate-pulse' : undefined} />
            <span className="sr-only">Email now</span>
          </Button>
        </form>
        <form action={callFormAction}>
          <Button type="submit" variant="outline" size="icon-sm" disabled={callPending || !hasPhone} title={hasPhone ? 'Call now, for real' : 'No phone on file'}>
            <PhoneIcon className={callPending ? 'animate-pulse' : undefined} />
            <span className="sr-only">Call now</span>
          </Button>
        </form>
      </div>
      {(emailState.error ?? callState.error) && <p className="max-w-48 text-right text-xs text-destructive">{emailState.error ?? callState.error}</p>}
    </div>
  );
}
