'use client';

import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { Category, CustomRequestOption } from '@/lib/types';
import { NewSourcingTabs } from './new/new-sourcing-tabs';

export function CreateSourcingDialog({ categories, customRequests }: { categories: Category[]; customRequests: CustomRequestOption[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}><PlusIcon data-icon="inline-start" />New request</DialogTrigger>
      <DialogContent className="flex max-h-[min(92dvh,56rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b bg-background px-6 py-5 pr-12"><DialogTitle>New sourcing request</DialogTitle><DialogDescription>Add items manually or upload a BOM, then match suppliers for bidding.</DialogDescription></DialogHeader>
        <div className="dialog-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6"><NewSourcingTabs categories={categories} customRequests={customRequests} /></div>
      </DialogContent>
    </Dialog>
  );
}
