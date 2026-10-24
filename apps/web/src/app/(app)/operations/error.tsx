'use client';

import { AlertTriangleIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OperationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-lg border text-center"><AlertTriangleIcon className="size-6 text-destructive" /><h1 className="text-lg font-semibold">Operations data is temporarily unavailable</h1><p className="max-w-md text-sm text-muted-foreground">Check API readiness and database connectivity, then retry.</p><Button onClick={reset} variant="outline"><RotateCcwIcon data-icon="inline-start" />Retry</Button></div>;
}
