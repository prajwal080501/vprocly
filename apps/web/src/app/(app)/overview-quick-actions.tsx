'use client';

import { ListPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { Category, CustomRequestOption } from '@/lib/types';
import { ManualEntryForm } from './sourcing/new/manual-entry-form';

export function OverviewQuickActions({ categories, customRequests }: { categories: Category[]; customRequests: CustomRequestOption[] }) {
  return (
    <div className="flex justify-start">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>
            <ListPlusIcon data-icon="inline-start" />
            Enter items manually
          </DialogTrigger>
          <DialogContent className="flex max-h-[min(92dvh,56rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
            <DialogHeader className="shrink-0 border-b bg-background px-6 py-5 pr-12">
              <DialogTitle>Add items directly</DialogTitle>
              <DialogDescription>Create a sourcing request and add its line items.</DialogDescription>
            </DialogHeader>
            <div className="dialog-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6"><ManualEntryForm categories={categories} customRequests={customRequests} /></div>
          </DialogContent>
        </Dialog>
    </div>
  );
}
