'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DownloadIcon, FileSpreadsheetIcon, FileUpIcon, LoaderCircleIcon, UploadCloudIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ImportResult } from '@/lib/types';
import { cn } from '@/lib/utils';

export function BomUploadForm({ useFileNameAsTitle = false }: { useFileNameAsTitle?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
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

  function selectFile(selected: File | null) {
    setFile(selected);
    setResult(null);
    if (useFileNameAsTitle) setTitle(selected ? selected.name.replace(/\.[^/.]+$/, '') : '');
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="flex flex-col gap-5">
      {!useFileNameAsTitle && (
        <Field>
          <FieldLabel htmlFor="bom-title">Title</FieldLabel>
          <Input id="bom-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q4 raw materials BOM" />
        </Field>
      )}

      <Field>
        <Input
          id="bom-file"
          type="file"
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            selectFile(selected);
            e.target.value = '';
          }}
        />
        <FieldLabel
          htmlFor="bom-file"
          className={cn(
            'flex min-h-56 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/35 p-8 text-center transition-colors',
            dragging && 'border-primary bg-accent',
          )}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            selectFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><UploadCloudIcon className="size-5" /></span>
          <span className="text-base font-semibold">Drop your Excel file here</span>
          <span className="text-sm font-normal text-muted-foreground">or click to browse · XLSX, XLS, or CSV</span>
        </FieldLabel>
      </Field>

      {file && (
        <div className="flex items-center gap-3 rounded-xl border bg-background p-3 shadow-xs">
          <span className="flex size-10 items-center justify-center rounded-lg bg-secondary"><FileSpreadsheetIcon className="size-5" /></span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{file.name}</div><div className="text-xs text-muted-foreground">{formatSize(file.size)}{useFileNameAsTitle ? ` · Request: ${title}` : ''}</div></div>
          <Badge variant="secondary">Ready</Badge>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => selectFile(null)} disabled={busy !== null}><XIcon /><span className="sr-only">Remove file</span></Button>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <a href="/api/bom-template" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}><DownloadIcon data-icon="inline-start" />Download Excel template</a>
        <Button type="button" onClick={submit} disabled={!file || !title || busy !== null} className="sm:min-w-32">
          {busy ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <FileUpIcon data-icon="inline-start" />}
          {busy ?? 'Import request'}
        </Button>
      </div>

      {result && 'error' in result && <FieldError>{result.error}</FieldError>}
      {result && 'status' in result && result.status === 'template_error' && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium">The file doesn&apos;t match the template.</p>
          {result.missingColumns.length > 0 && <p className="mt-1">Missing columns: {result.missingColumns.join(', ')}</p>}
          {result.unrecognizedColumns.length > 0 && <p className="mt-1">Unrecognized columns: {result.unrecognizedColumns.join(', ')}</p>}
          {result.unknownCategories && result.unknownCategories.length > 0 && (
            <p className="mt-1">Unknown categories: {result.unknownCategories.join(', ')} (must match the fixed category list exactly)</p>
          )}
        </div>
      )}
      {result && 'status' in result && result.status === 'row_errors' && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
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
