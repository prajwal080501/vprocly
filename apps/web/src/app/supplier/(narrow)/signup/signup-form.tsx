'use client';

import { signIn } from 'next-auth/react';
import { useActionState, useEffect, useState } from 'react';
import { CategoryPicker } from '@/components/category-picker';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category } from '@/lib/types';
import { signupSupplierSelf, type SupplierSignupState } from './actions';

export function SupplierSignupForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<SupplierSignupState, FormData>(signupSupplierSelf, {});
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  useEffect(() => {
    if (state.success) signIn('keycloak', { callbackUrl: '/supplier/dashboard' });
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
          <FieldLabel htmlFor="supplier-gst">GST number</FieldLabel>
          <Input id="supplier-gst" name="gst" autoComplete="off" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-email">Work email</FieldLabel>
          <Input id="supplier-email" name="email" type="email" autoComplete="email" required />
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
        <Button type="submit" disabled={pending || selectedCategories.length === 0} className="w-full" size="lg">
          {pending ? 'Creating your account' : 'Create your account'}
        </Button>
      </FieldGroup>
    </form>
  );
}
