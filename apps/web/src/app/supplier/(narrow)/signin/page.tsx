import Link from 'next/link';
import { SignInButton } from '@/components/sign-in-button';

export default function SupplierSignInPage() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
      <h1 className="text-xl font-semibold">vProcly for suppliers</h1>
      <p className="mt-1 mb-6 text-sm text-muted">See open sourcing opportunities and place bids.</p>
      <SignInButton callbackUrl="/supplier/dashboard" label="Sign in" />
      <p className="mt-4 text-center text-sm text-muted">
        New supplier? <Link href="/supplier/signup" className="text-accent hover:underline">Create your account</Link>
      </p>
      <p className="mt-2 text-center text-sm text-muted">
        Buyer? <Link href="/signin" className="text-accent hover:underline">Sign in here</Link>
      </p>
    </div>
  );
}
