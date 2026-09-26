'use client';

import { signIn } from 'next-auth/react';
import { useActionState, useEffect } from 'react';
import type { Category } from '@/lib/types';
import { signupSupplierSelf, type SupplierSignupState } from './actions';

const input = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent';

export function SupplierSignupForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<SupplierSignupState, FormData>(signupSupplierSelf, {});

  useEffect(() => {
    if (state.success) signIn('keycloak', { callbackUrl: '/supplier/dashboard' });
  }, [state.success]);

  if (state.success) {
    return <p className="text-center text-sm text-muted">Account created — taking you to sign in…</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Company name</label>
        <input name="name" className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">GST number</label>
        <input name="gst" className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Work email</label>
        <input name="email" type="email" className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Category</label>
        <select name="categoryId" className={input} required defaultValue="">
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">City</label>
          <input name="city" className={input} required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">State</label>
          <input name="state" className={input} required />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Country</label>
        <input name="country" className={input} required defaultValue="India" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Password</label>
        <input name="password" type="password" minLength={8} className={input} required />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg disabled:opacity-60">
        {pending ? 'Creating your account…' : 'Create your account'}
      </button>
    </form>
  );
}
