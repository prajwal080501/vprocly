'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteSourcingRequest } from './actions';

export function DeleteSourcingRequestButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm(`Delete "${title}"? This removes it and its items for every matched or invited supplier.`)) return;
    setPending(true);
    setError(null);
    const result = await deleteSourcingRequest(id);
    setPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={pending} className="text-sm text-muted hover:text-danger disabled:opacity-50">
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
