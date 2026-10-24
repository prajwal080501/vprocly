'use client';

import { signIn } from 'next-auth/react';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CategoryPicker } from '@/components/category-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category } from '@/lib/types';
import { requestInviteOtp, signupSupplier, verifyInviteOtp, type OtpRequestState, type OtpVerifyState, type SignupState } from './actions';

export function SignupForm({ token, email, categories, defaultCategoryName }: { token: string; email: string; categories: Category[]; defaultCategoryName: string }) {
  const action = signupSupplier.bind(null, token);
  const [state, formAction, pending] = useActionState<SignupState, FormData>(action, {});
  const [otpRequest, otpRequestAction, otpRequestPending] = useActionState<OtpRequestState, FormData>(requestInviteOtp.bind(null, token), {});
  const [otpVerify, otpVerifyAction, otpVerifyPending] = useActionState<OtpVerifyState, FormData>(verifyInviteOtp.bind(null, token), {});
  const [selectedCategories, setSelectedCategories] = useState<string[]>(defaultCategoryName ? [defaultCategoryName] : []);
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => {
    if (state.success) signIn('keycloak', { callbackUrl: '/supplier/dashboard' }, { login_hint: email, prompt: 'login' });
  }, [email, state.success]);

  if (state.success) {
    return (
      <Card className="text-center">
        <CardContent>
          <p className="text-lg font-medium">You&apos;re all set!</p>
          <p className="mt-1 text-sm text-muted-foreground">Wallet balance: {state.success.walletBalance} points</p>
          <p className="mt-4 text-sm text-muted-foreground">Taking you to your dashboard…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form action={formAction}>
          <FieldGroup>
            <p className="text-sm text-muted-foreground">Signing up as <span className="font-medium text-foreground">{email}</span></p>
            <Field>
              <FieldLabel htmlFor="invite-otp">Verify your email</FieldLabel>
              {otpVerify.verificationToken ? (
                <p className="text-sm font-medium text-emerald-700">Email verified</p>
              ) : (
                <div className="flex gap-2">
                  <Input id="invite-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder={otpRequest.sent ? '6-digit code' : 'Send a code first'} disabled={!otpRequest.sent} value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
                  {otpRequest.sent
                    ? <Button type="button" variant="outline" onClick={() => { const data = new FormData(); data.set('otpCode', otpCode); startTransition(() => otpVerifyAction(data)); }} disabled={otpVerifyPending || otpCode.length !== 6}>{otpVerifyPending ? 'Verifying…' : 'Verify'}</Button>
                    : <Button type="button" variant="outline" onClick={() => startTransition(() => otpRequestAction(new FormData()))} disabled={otpRequestPending}>{otpRequestPending ? 'Sending…' : 'Send code'}</Button>}
                </div>
              )}
              <FieldDescription>We&apos;ll send a six-digit code to {email}. It expires in 10 minutes.</FieldDescription>
              {otpRequest.sent && !otpVerify.verificationToken && <Button type="button" variant="ghost" size="sm" className="self-start px-0" onClick={() => startTransition(() => otpRequestAction(new FormData()))} disabled={otpRequestPending}>Resend code</Button>}
              {(otpRequest.error || otpVerify.error) && <FieldError>{otpRequest.error ?? otpVerify.error}</FieldError>}
              {otpVerify.verificationToken && <input type="hidden" name="verificationToken" value={otpVerify.verificationToken} />}
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-name">Company name</FieldLabel>
              <Input id="invite-name" name="name" autoComplete="organization" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-phone">Mobile number</FieldLabel>
              <Input id="invite-phone" name="phone" type="tel" autoComplete="tel" minLength={8} maxLength={32} placeholder="+91 98765 43210" />
              <FieldDescription>Optional for now. Add it to receive sourcing and verification updates.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-gst">GST number <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input id="invite-gst" name="gst" autoComplete="off" maxLength={32} />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-category">Categories</FieldLabel>
              <CategoryPicker id="invite-category" categories={categories} value={selectedCategories} onChange={setSelectedCategories} multiple />
              {selectedCategories.map((category) => <input key={category} type="hidden" name="categories" value={category} />)}
              <FieldDescription>The matched category is preselected. Add every other category your company supplies.</FieldDescription>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="invite-city">City</FieldLabel>
                <Input id="invite-city" name="city" autoComplete="address-level2" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-state">State</FieldLabel>
                <Input id="invite-state" name="state" autoComplete="address-level1" required />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="invite-password">Password</FieldLabel>
              <Input id="invite-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            {state.error && <FieldError>{state.error}</FieldError>}
            <Button type="submit" disabled={pending || selectedCategories.length === 0 || !otpVerify.verificationToken} className="w-full" size="lg">
              {pending ? 'Creating your account' : 'Sign up and start bidding'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
