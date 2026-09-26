'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ImportResult } from '@/lib/types';

const input = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent';

export function BomUploadForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | { error: string } | null>(null);

  async function submit() {
    if (!file || !title) return;
    setResult(null);
    setBusy('Uploading and checking your file for safety…');
    const form = new FormData();
    form.set('title', title);
    form.set('file', file);
    const res = await fetch('/api/bom-import', { method: 'POST', body: form });
    const body = (await res.json()) as ImportResult | { error: string };
    setBusy(null);
    if (res.ok && 'sourcingRequestId' in body) {
      router.push(`/sourcing/${body.sourcingRequestId}`);
      return;
    }
    setResult(body);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Title</label>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q4 raw materials BOM" />
      </div>

      <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm">
        <p className="text-muted">
          Use the fixed template so we can read your file:{' '}
          <a href="/api/bom-template" className="text-accent hover:underline">
            download template.csv
          </a>
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mx-auto mt-3 block text-sm"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!file || !title || busy !== null}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
      >
        {busy ?? 'Import'}
      </button>

      {result && 'error' in result && <p className="text-sm text-danger">{result.error}</p>}
      {result && 'status' in result && result.status === 'template_error' && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium">The file doesn&apos;t match the template.</p>
          {result.missingColumns.length > 0 && <p className="mt-1">Missing columns: {result.missingColumns.join(', ')}</p>}
          {result.unrecognizedColumns.length > 0 && <p className="mt-1">Unrecognized columns: {result.unrecognizedColumns.join(', ')}</p>}
          {result.unknownCategories && result.unknownCategories.length > 0 && (
            <p className="mt-1">Unknown categories: {result.unknownCategories.join(', ')} (must match the fixed category list exactly)</p>
          )}
        </div>
      )}
      {result && 'status' in result && result.status === 'row_errors' && (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium">
            {result.validCount} of {result.totalRows} rows are valid. Fix these and re-upload:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {result.rowErrors.slice(0, 10).map((r) => (
              <li key={r.row}>Row {r.row}: {r.errors.join('; ')}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
