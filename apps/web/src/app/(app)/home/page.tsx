import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Category, SourcingRequestListEntry } from '@/lib/types';
import { OverviewQuickActions } from '../overview-quick-actions';
import { BomUploadForm } from '../sourcing/new/bom-upload-form';

export default async function OverviewPage() {
  const [categories, requests] = await Promise.all([
    api<Category[]>('/categories'),
    api<SourcingRequestListEntry[]>('/sourcing-requests'),
  ]);
  const customRequests = requests
    .filter((request) => request.source === 'manual' && request.status === 'open')
    .map((request) => ({ id: request.id, title: request.title, lineCount: request.lines.length }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-4 md:py-8">
      <header><h1 className="page-heading">Create a sourcing request</h1><p className="page-description">Upload a BOM for the fastest setup, or enter a few items manually.</p></header>
      <Card className="shadow-none">
        <CardHeader className="border-b bg-muted/20"><CardTitle>Upload BOM</CardTitle><CardDescription>Excel files are validated before supplier research begins.</CardDescription></CardHeader>
        <CardContent><BomUploadForm useFileNameAsTitle /></CardContent>
      </Card>
      <OverviewQuickActions categories={categories} customRequests={customRequests} />
    </div>
  );
}
