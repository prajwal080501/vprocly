import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Category } from '@/lib/types';
import { OverviewQuickActions } from '../overview-quick-actions';
import { BomUploadForm } from '../sourcing/new/bom-upload-form';

export default async function OverviewPage() {
  const categories = await api<Category[]>('/categories');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6 md:py-10">
      <header className="text-center"><h1 className="text-3xl font-semibold tracking-tight">Source a request</h1><p className="mt-2 text-sm text-muted-foreground">Upload an Excel BOM and we’ll create the request using its filename.</p></header>
      <Card>
        <CardHeader><CardTitle>Upload Excel</CardTitle><CardDescription>Use the sourcing template for automatic validation and supplier matching.</CardDescription></CardHeader>
        <CardContent><BomUploadForm useFileNameAsTitle /></CardContent>
      </Card>
      <OverviewQuickActions categories={categories} />
    </div>
  );
}
