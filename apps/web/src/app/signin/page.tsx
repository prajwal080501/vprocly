import Link from 'next/link';
import { SignInButton } from '@/components/sign-in-button';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold">vProcly</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Procurement, finance control and ExceptionOS.</p>
        <SignInButton />
        <p className="mt-4 text-center text-sm text-muted">
          New company? <Link href="/signup" className="text-accent hover:underline">Create your organisation</Link>
        </p>
      </div>
    </main>
  );
}
