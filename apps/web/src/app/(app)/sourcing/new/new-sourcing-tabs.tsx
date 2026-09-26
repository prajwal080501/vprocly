'use client';

import { useState } from 'react';
import type { Category } from '@/lib/types';
import { BomUploadForm } from './bom-upload-form';
import { ManualEntryForm } from './manual-entry-form';

export function NewSourcingTabs({ categories }: { categories: Category[] }) {
  const [tab, setTab] = useState<'manual' | 'bom'>('manual');
  const tabClass = (active: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium ${active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-text'}`;

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('manual')} className={tabClass(tab === 'manual')}>
          Add items manually
        </button>
        <button type="button" onClick={() => setTab('bom')} className={tabClass(tab === 'bom')}>
          Upload a BOM file
        </button>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        {tab === 'manual' ? <ManualEntryForm categories={categories} /> : <BomUploadForm />}
      </div>
    </div>
  );
}
