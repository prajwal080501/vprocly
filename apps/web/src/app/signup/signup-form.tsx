'use client';

import { signIn } from 'next-auth/react';
import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { signupOrganization, type SignupState } from './actions';

export function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(signupOrganization, {});

  useEffect(() => {
    if (state.success) signIn('keycloak', { callbackUrl: '/' });
  }, [state.success]);

  if (state.success) {
    return <p className="text-center text-sm text-muted-foreground">Account created — taking you to sign in…</p>;
  }

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="company-name">Company name</FieldLabel>
          <Input id="company-name" name="companyName" autoComplete="organization" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="admin-name">Your name</FieldLabel>
          <Input id="admin-name" name="adminName" autoComplete="name" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="work-email">Work email</FieldLabel>
          <Input id="work-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        {state.error && <FieldError>{state.error}</FieldError>}
        <Button type="submit" disabled={pending} className="w-full" size="lg">
          {pending ? 'Creating your account' : 'Create your organisation'}
        </Button>
      </FieldGroup>
    </form>
  );
}
