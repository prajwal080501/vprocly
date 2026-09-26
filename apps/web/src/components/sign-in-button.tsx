'use client';

import { signIn, signOut } from 'next-auth/react';

export function SignInButton({ callbackUrl = '/', label = 'Sign in with your organisation' }: { callbackUrl?: string; label?: string }) {
  return (
    <button
      onClick={() => signIn('keycloak', { callbackUrl })}
      className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
    >
      {label}
    </button>
  );
}

export function SignOutButton({ callbackUrl = '/signin' }: { callbackUrl?: string }) {
  return (
    <button onClick={() => signOut({ callbackUrl })} className="text-sm text-muted hover:text-text">
      Sign out
    </button>
  );
}
