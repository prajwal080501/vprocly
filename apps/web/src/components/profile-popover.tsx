'use client';

import { useActionState } from 'react';
import { signOut } from 'next-auth/react';
import { Building2Icon, CheckCircle2Icon, CoinsIcon, LogOutIcon, MailIcon, MapPinIcon, PhoneIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

export type UpdatePhoneState = { error?: string; success?: boolean };

type ProfileDetail = {
  label: string;
  value: string;
  icon: 'email' | 'location' | 'balance' | 'organization';
};

const detailIcons = {
  email: MailIcon,
  location: MapPinIcon,
  balance: CoinsIcon,
  organization: Building2Icon,
};

type ProfilePopoverProps = {
  name: string;
  subtitle: string;
  accountLabel: string;
  initials: string;
  details: ProfileDetail[];
  callbackUrl: string;
  /** Own mobile number, editable right here -- undefined omits the field entirely (not every caller has to
   *  support it yet). */
  phone?: string | null;
  onUpdatePhone?: (previous: UpdatePhoneState, formData: FormData) => Promise<UpdatePhoneState>;
};

function EditablePhone({ phone, onUpdatePhone }: { phone: string | null; onUpdatePhone: (previous: UpdatePhoneState, formData: FormData) => Promise<UpdatePhoneState> }) {
  const [state, formAction, pending] = useActionState(onUpdatePhone, {});
  return (
    <form action={formAction} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 text-left">
      <PhoneIcon className="size-4 text-muted-foreground" />
      <div className="min-w-0">
        <label htmlFor="profile-phone" className="text-xs text-muted-foreground">Mobile number</label>
        <Input id="profile-phone" name="phone" type="tel" defaultValue={phone ?? ''} placeholder="Not set" className="h-7 px-1.5 text-sm" />
      </div>
      <Button type="submit" size="sm" variant="ghost" disabled={pending} className="self-end">
        {pending ? 'Saving' : 'Save'}
      </Button>
      {state.error && <p className="col-span-3 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function ProfilePopover({ name, subtitle, accountLabel, initials, details, callbackUrl, phone, onUpdatePhone }: ProfilePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="h-10 rounded-xl px-2 sm:pr-3" aria-label="Open profile">
            <Avatar className="size-7">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-36 truncate sm:block">{name}</span>
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={10} className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0 shadow-xl shadow-foreground/10">
        <div className="relative flex min-h-36 items-center justify-center overflow-hidden bg-secondary/70 p-5">
          <div className="absolute inset-x-5 top-5 h-px bg-border" />
          <div className="absolute inset-x-8 bottom-5 h-px bg-border" />
          <div className="relative flex size-20 items-center justify-center rounded-2xl border bg-background shadow-lg shadow-foreground/10">
            <Building2Icon className="size-9 text-foreground" strokeWidth={1.5} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 px-5 pb-5 pt-4 text-center">
          <Badge variant="secondary">
            <CheckCircle2Icon data-icon="inline-start" />
            {accountLabel}
          </Badge>
          <div>
            <p className="text-lg font-semibold tracking-tight">{name}</p>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <Separator />
        <div className="flex flex-col gap-3 px-5 py-4">
          {details.map((detail) => {
            const Icon = detailIcons[detail.icon];
            return (
              <div key={detail.label} className="grid grid-cols-[1.75rem_1fr] items-center gap-2 text-left">
                <Icon className="size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{detail.label}</p>
                  <p className="truncate text-sm font-medium">{detail.value}</p>
                </div>
              </div>
            );
          })}
          {onUpdatePhone && <EditablePhone phone={phone ?? null} onUpdatePhone={onUpdatePhone} />}
        </div>
        <Separator />
        <div className="p-3">
          <Button onClick={() => signOut({ callbackUrl })} variant="ghost" className="w-full justify-start rounded-xl">
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
