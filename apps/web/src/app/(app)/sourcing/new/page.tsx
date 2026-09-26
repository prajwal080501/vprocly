import { api } from '@/lib/api';
import type { Category } from '@/lib/types';
import { NewSourcingTabs } from './new-sourcing-tabs';

export default async function NewSourcingPage() {
  const categories = await api<Category[]>('/categories');
  return (
    <div className="max-w-4xl space-y-2">
      <h1 className="text-2xl font-semibold">New sourcing request</h1>
      <p className="mb-4 text-sm text-muted">
        We&apos;ll match your items to suppliers by category and location, and invite them to bid.
      </p>
      <NewSourcingTabs categories={categories} />
    </div>
  );
}
