import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PublicApiError, publicApi } from '@/lib/public-api';
import type { VoiceBidConfirmation } from '@/lib/types';
import { ConfirmationForm } from './confirmation-form';

export default async function BidConfirmationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let draft: VoiceBidConfirmation;
  try {
    draft = await publicApi<VoiceBidConfirmation>(`/bid-confirmations/${token}`);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) return <p className="text-center text-sm text-muted-foreground">This confirmation link is invalid or has expired.</p>;
    throw error;
  }
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold">Review your quote</h1><p className="mt-1 text-sm text-muted-foreground">Confirm the details captured during your supplier call.</p></div>
      <Card>
        <CardHeader><CardTitle className="text-base">{draft.description}</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {draft.itemCode && <p>Item code: {draft.itemCode}</p>}
          <p>{draft.qty} {draft.uom}</p>
          <p>Delivery: {draft.deliveryCity}, {draft.deliveryState}</p>
          {draft.needBy && <p>Needed by: {new Date(draft.needBy).toLocaleDateString()}</p>}
        </CardContent>
      </Card>
      <Card><CardContent><ConfirmationForm token={token} draft={draft} /></CardContent></Card>
    </div>
  );
}
