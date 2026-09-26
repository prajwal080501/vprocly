import Link from 'next/link';
import { publicApi } from '@/lib/public-api';
import type { Category } from '@/lib/types';
import { SupplierSignupForm } from './signup-form';

export default async function SupplierSignupPage() {
  const categories = await publicApi<Category[]>('/categories');

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
      <h1 className="text-xl font-semibold">Become a vProcly supplier</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Get matched to sourcing requests and start bidding — 1000 points free on signup.</p>
      <SupplierSignupForm categories={categories} />
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account? <Link href="/supplier/signin" className="text-accent hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
