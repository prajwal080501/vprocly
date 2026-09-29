'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={handleClick} disabled={pending} variant="destructive" size="sm">
        <Trash2Icon data-icon="inline-start" />
        {pending ? 'Deleting' : 'Delete'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
