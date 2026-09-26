import { NextResponse } from 'next/server';
import { api, ApiError } from '@/lib/api';

const SCAN_POLL_INTERVAL_MS = 500;
const SCAN_TIMEOUT_MS = 15_000;

type DocumentStatus = { status: string };
type Upload = { documentId: string; uploadUrl: string; headers: Record<string, string> };

/**
 * Orchestrates the whole BOM import server-side, hidden behind one request from the browser: presigned
 * upload, virus scan (real, asynchronous -- see apps/worker's document scanner), then the actual import.
 * Keeps the client to one "Import" button and one loading state; the multi-step pipeline underneath is a
 * real, already-built security feature (Sprint 0), not skipped for this flow.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  const title = String(form.get('title') ?? '').trim();
  if (!(file instanceof File) || !title) {
    return NextResponse.json({ error: 'A title and a file are required' }, { status: 400 });
  }

  let documentId: string;
  try {
    const upload = await api<Upload>('/documents/uploads', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, contentType: file.type || 'text/csv', sizeBytes: file.size, purpose: 'import' }),
    });
    const putRes = await fetch(upload.uploadUrl, { method: 'PUT', body: await file.arrayBuffer(), headers: upload.headers });
    if (!putRes.ok) return NextResponse.json({ error: 'Could not upload the file' }, { status: 502 });
    await api(`/documents/${upload.documentId}/complete`, { method: 'POST', body: JSON.stringify({ purpose: 'import' }) });
    documentId = upload.documentId;
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: (err.body as { message?: string })?.message ?? 'Upload failed' }, { status: 400 });
    throw err;
  }

  const deadline = Date.now() + SCAN_TIMEOUT_MS;
  let status = 'pending_scan';
  while (status === 'pending_scan' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SCAN_POLL_INTERVAL_MS));
    status = (await api<DocumentStatus>(`/documents/${documentId}`)).status;
  }
  if (status === 'pending_scan') {
    return NextResponse.json({ error: 'Still checking your file for safety -- please try importing again in a moment.' }, { status: 202 });
  }
  if (status !== 'clean') {
    return NextResponse.json({ error: 'This file could not be verified as safe. Please try a different file.' }, { status: 422 });
  }

  try {
    const result = await api(`/sourcing-requests/import`, { method: 'POST', body: JSON.stringify({ title, documentId }) });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: (err.body as { message?: string })?.message ?? 'Import failed' }, { status: 400 });
    throw err;
  }
}
