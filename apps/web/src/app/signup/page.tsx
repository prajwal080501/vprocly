import Link from 'next/link';
import { SignupForm } from './signup-form';

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold">Create your organisation</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Start posting sourcing requests in a couple of minutes.</p>
        <SignupForm />
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account? <Link href="/signin" className="text-accent hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
