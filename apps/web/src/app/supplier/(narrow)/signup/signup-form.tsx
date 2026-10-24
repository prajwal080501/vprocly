'use client';

import { signIn } from 'next-auth/react';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { CategoryPicker } from '@/components/category-picker';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category } from '@/lib/types';
import { requestSupplierOtp, signupSupplierSelf, verifySupplierOtp, type SupplierOtpRequestState, type SupplierOtpVerifyState, type SupplierSignupState } from './actions';

export function SupplierSignupForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<SupplierSignupState, FormData>(signupSupplierSelf, {});
  const [otpRequest, otpRequestAction, otpRequestPending] = useActionState<SupplierOtpRequestState, FormData>(requestSupplierOtp, {});
  const [otpVerify, otpVerifyAction, otpVerifyPending] = useActionState<SupplierOtpVerifyState, FormData>(verifySupplierOtp, {});
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => {
    if (state.success) signIn('keycloak', { callbackUrl: '/supplier/dashboard' }, { login_hint: state.success.email, prompt: 'login' });
  }, [state.success]);

  if (state.success) {
    return <p className="text-center text-sm text-muted-foreground">Account created — taking you to sign in…</p>;
  }

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="supplier-name">Company name</FieldLabel>
          <Input id="supplier-name" name="name" autoComplete="organization" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-phone">Mobile number</FieldLabel>
          <Input id="supplier-phone" name="phone" type="tel" autoComplete="tel" minLength={8} maxLength={32} placeholder="+91 98765 43210" />
          <FieldDescription>Optional for now. Add it to receive sourcing and verification updates.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-gst">GST number <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
          <Input id="supplier-gst" name="gst" autoComplete="off" maxLength={32} />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-email">Work email</FieldLabel>
          <Input id="supplier-email" name="email" type="email" autoComplete="email" required readOnly={Boolean(otpVerify.verificationToken)} value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-otp">Verify your email</FieldLabel>
          {otpVerify.verificationToken ? (
            <p className="text-sm font-medium text-emerald-700">Email verified</p>
          ) : (
            <div className="flex gap-2">
              <Input id="supplier-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder={otpRequest.sent ? '6-digit code' : 'Send a code first'} disabled={!otpRequest.sent} value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
              {otpRequest.sent
                ? <Button type="button" variant="outline" onClick={() => { const data = new FormData(); data.set('email', email); data.set('otpCode', otpCode); startTransition(() => otpVerifyAction(data)); }} disabled={otpVerifyPending || otpCode.length !== 6}>{otpVerifyPending ? 'Verifying…' : 'Verify'}</Button>
                : <Button type="button" variant="outline" onClick={() => { const data = new FormData(); data.set('email', email); startTransition(() => otpRequestAction(data)); }} disabled={otpRequestPending || !email}>{otpRequestPending ? 'Sending…' : 'Send code'}</Button>}
            </div>
          )}
          <FieldDescription>The six-digit code expires in 10 minutes.</FieldDescription>
          {otpRequest.sent && !otpVerify.verificationToken && <Button type="button" variant="ghost" size="sm" className="self-start px-0" onClick={() => { const data = new FormData(); data.set('email', email); startTransition(() => otpRequestAction(data)); }} disabled={otpRequestPending}>Resend code</Button>}
          {(otpRequest.error || otpVerify.error) && <FieldError>{otpRequest.error ?? otpVerify.error}</FieldError>}
          {otpVerify.verificationToken && <input type="hidden" name="verificationToken" value={otpVerify.verificationToken} />}
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-category">Categories</FieldLabel>
          <CategoryPicker id="supplier-category" categories={categories} value={selectedCategories} onChange={setSelectedCategories} multiple />
          {selectedCategories.map((category) => <input key={category} type="hidden" name="categories" value={category} />)}
          <FieldDescription>Select every category your company can supply. You can choose up to 20.</FieldDescription>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="supplier-city">City</FieldLabel>
            <Input id="supplier-city" name="city" autoComplete="address-level2" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-state">State</FieldLabel>
            <Input id="supplier-state" name="state" autoComplete="address-level1" required />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="supplier-country">Country</FieldLabel>
          <Input id="supplier-country" name="country" autoComplete="country-name" required defaultValue="India" />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-password">Password</FieldLabel>
          <Input id="supplier-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        {state.error && <FieldError>{state.error}</FieldError>}
        <Button type="submit" disabled={pending || selectedCategories.length === 0 || !otpVerify.verificationToken} className="w-full" size="lg">
          {pending ? 'Creating your account' : 'Create your account'}
        </Button>
      </FieldGroup>
    </form>
  );
}
