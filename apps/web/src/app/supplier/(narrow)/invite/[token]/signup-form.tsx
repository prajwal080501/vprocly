'use client';

import { signIn } from 'next-auth/react';
import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CategoryPicker } from '@/components/category-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category } from '@/lib/types';
import { signupSupplier, type SignupState } from './actions';

export function SignupForm({ token, email, categories, defaultCategoryName }: { token: string; email: string; categories: Category[]; defaultCategoryName: string }) {
  const action = signupSupplier.bind(null, token);
  const [state, formAction, pending] = useActionState<SignupState, FormData>(action, {});
  const [selectedCategories, setSelectedCategories] = useState<string[]>(defaultCategoryName ? [defaultCategoryName] : []);

  useEffect(() => {
    if (state.success) signIn('keycloak', { callbackUrl: '/supplier/dashboard' });
  }, [state.success]);

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
              <FieldLabel htmlFor="invite-name">Company name</FieldLabel>
              <Input id="invite-name" name="name" autoComplete="organization" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-gst">GST number</FieldLabel>
              <Input id="invite-gst" name="gst" autoComplete="off" required />
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
            <Button type="submit" disabled={pending || selectedCategories.length === 0} className="w-full" size="lg">
              {pending ? 'Creating your account' : 'Sign up and start bidding'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
