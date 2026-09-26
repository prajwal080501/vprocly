'use client';

import { signIn } from 'next-auth/react';
import { useActionState, useEffect } from 'react';
import { signupOrganization, type SignupState } from './actions';

const input = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent';

export function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(signupOrganization, {});

  useEffect(() => {
    if (state.success) signIn('keycloak', { callbackUrl: '/' });
  }, [state.success]);

  if (state.success) {
    return <p className="text-center text-sm text-muted">Account created — taking you to sign in…</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Company name</label>
        <input name="companyName" className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Your name</label>
        <input name="adminName" className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Work email</label>
        <input name="email" type="email" className={input} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Password</label>
        <input name="password" type="password" minLength={8} className={input} required />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg disabled:opacity-60">
        {pending ? 'Creating your account…' : 'Create your organisation'}
      </button>
    </form>
  );
}
