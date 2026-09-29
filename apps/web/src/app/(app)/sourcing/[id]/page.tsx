import { api } from '@/lib/api';
import type { Me, SourcingRequestDetail } from '@/lib/types';
import { SourcingDetailView } from './sourcing-detail-view';

export default async function SourcingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string }>;
}) {
  const { id } = await params;
  const { line } = await searchParams;
  const [request, me] = await Promise.all([
    api<SourcingRequestDetail>(`/sourcing-requests/${id}`),
    api<Me>('/me'),
  ]);
  return <SourcingDetailView request={request} currency={me.tenant.defaultCurrency} initialLineId={line} />;
}
