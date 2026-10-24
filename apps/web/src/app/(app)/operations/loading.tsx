import { Skeleton } from '@/components/ui/skeleton';

export default function OperationsLoading() {
  return <div className="flex flex-col gap-8"><div className="border-b pb-6"><Skeleton className="h-7 w-44" /><Skeleton className="mt-3 h-4 w-96 max-w-full" /></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-72" /><Skeleton className="h-64" /></div>;
}
