'use client';

import { signIn, signOut } from 'next-auth/react';

export function SignInButton() {
  return (
    <button
      onClick={() => signIn('keycloak', { callbackUrl: '/' })}
      className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
    >
      Sign in with your organisation
    </button>
  );
}

export function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: '/signin' })} className="text-sm text-muted hover:text-text">
      Sign out
    </button>
  );
}
