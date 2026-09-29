'use client';

import { ClipboardListIcon, FileSpreadsheetIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Category } from '@/lib/types';
import { BomUploadForm } from './bom-upload-form';
import { ManualEntryForm } from './manual-entry-form';

export function NewSourcingTabs({ categories }: { categories: Category[] }) {
  return (
    <Tabs defaultValue="manual" className="gap-5">
      <TabsList className="mt-5 w-full sm:w-fit">
        <TabsTrigger value="manual">
          <ClipboardListIcon data-icon="inline-start" />
          Add items manually
        </TabsTrigger>
        <TabsTrigger value="bom">
          <FileSpreadsheetIcon data-icon="inline-start" />
          Upload a BOM file
        </TabsTrigger>
      </TabsList>
      <TabsContent value="manual">
        <ManualEntryForm categories={categories} />
      </TabsContent>
      <TabsContent value="bom">
        <BomUploadForm />
      </TabsContent>
    </Tabs>
  );
}
