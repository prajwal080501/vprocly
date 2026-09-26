'use client';

import { signIn } from 'next-auth/react';
import { useActionState, useEffect } from 'react';
import type { Category } from '@/lib/types';
import { signupSupplier, type SignupState } from './actions';

const input = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent';

export function SignupForm({ token, email, categories, defaultCategoryId }: { token: string; email: string; categories: Category[]; defaultCategoryId: string }) {
  const action = signupSupplier.bind(null, token);
  const [state, formAction, pending] = useActionState<SignupState, FormData>(action, {});

  useEffect(() => {
    if (state.success) signIn('keycloak', { callbackUrl: '/supplier/dashboard' });
  }, [state.success]);

  if (state.success) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-lg font-medium">You&apos;re all set!</p>
        <p className="mt-1 text-sm text-muted">Wallet balance: {state.success.walletBalance} points</p>
        <p className="mt-4 text-sm text-muted">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-6">
      <p className="text-sm text-muted">Signing up as <span className="font-medium text-text">{email}</span></p>
      <div>
        <label className="mb-1 block text-sm font-medium">Company name</label>
        <input name="name" className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">GST number</label>
        <input name="gst" className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Category</label>
        <select name="categoryId" defaultValue={defaultCategoryId} className={input} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
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
        <label className="mb-1 block text-sm font-medium">Password</label>
        <input name="password" type="password" minLength={8} className={input} required />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg disabled:opacity-60">
        {pending ? 'Creating your account…' : 'Sign up and start bidding'}
      </button>
    </form>
  );
}
