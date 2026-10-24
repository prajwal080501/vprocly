'use client';

import { signIn, signOut } from 'next-auth/react';
import { LogInIcon, LogOutIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function SignInButton({ callbackUrl = '/', label = 'Sign in with your organisation' }: { callbackUrl?: string; label?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button onClick={() => { setPending(true); void signIn('keycloak', { callbackUrl }); }} disabled={pending} className="w-full" size="lg">
      <LogInIcon data-icon="inline-start" />
      {pending ? 'Opening secure sign in…' : label}
    </Button>
  );
}

export function SignOutButton({ callbackUrl = '/signin' }: { callbackUrl?: string }) {
  return (
    <Button onClick={() => signOut({ callbackUrl })} variant="ghost" size="sm">
      <LogOutIcon data-icon="inline-start" />
      Sign out
    </Button>
  );
}
