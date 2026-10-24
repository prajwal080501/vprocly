'use server';

import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/lib/api';

export type AcceptBidState = { error?: string; success?: boolean };
export type InviteToLineState = { error?: string; success?: { invitedNewCount: number } };
export type RetryResearchState = { error?: string; success?: boolean };
export type ManualOutreachState = { error?: string; success?: boolean };
export type RecordOutcomeState = { error?: string; success?: boolean };
export type ClarificationState = { error?: string; success?: boolean };

export async function sendBuyerClarification(
  requestId: string,
  lineId: string,
  platformSupplierId: string,
  _previous: ClarificationState,
  formData: FormData,
): Promise<ClarificationState> {
  const message = String(formData.get('message') ?? '').trim();
  if (!message) return { error: 'Enter a message' };
  if (message.length > 2000) return { error: 'Message must be 2000 characters or less' };
  try {
    await api(`/sourcing-requests/${requestId}/lines/${lineId}/clarifications`, {
      method: 'POST',
      body: JSON.stringify({ platformSupplierId, message }),
    });
    revalidatePath(`/sourcing/${requestId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) return { error: (error.body as { message?: string } | null)?.message ?? 'Could not send the message' };
    return { error: 'Could not send the message' };
  }
}

export async function inviteToLine(requestId: string, lineId: string, _previous: InviteToLineState, formData: FormData): Promise<InviteToLineState> {
  const emails = String(formData.get('emails') ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  if (emails.length === 0) return { error: 'Enter at least one email address' };
  try {
    const result = await api<{ invitedNewCount: number }>(`/sourcing-requests/${requestId}/lines/${lineId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    });
    revalidatePath(`/sourcing/${requestId}`);
    return { success: result };
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { message?: string } | null;
      return { error: body?.message ?? 'Could not send the invite' };
    }
    return { error: 'Could not send the invite' };
  }
}

export async function acceptBid(requestId: string, lineId: string, bidId: string, _previous: AcceptBidState): Promise<AcceptBidState> {
  void _previous;
  try {
    await api(`/sourcing-requests/${requestId}/lines/${lineId}/bids/${bidId}/accept`, { method: 'POST' });
    revalidatePath(`/sourcing/${requestId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { message?: string } | null;
      return { error: body?.message ?? 'Could not accept this bid' };
    }
    return { error: 'Could not accept this bid' };
  }
}

export async function retryResearch(requestId: string, lineId: string, _previous: RetryResearchState): Promise<RetryResearchState> {
  void _previous;
  try {
    await api(`/sourcing-requests/${requestId}/lines/${lineId}/research/retry`, { method: 'POST' });
    revalidatePath(`/sourcing/${requestId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { message?: string } | null;
      return { error: body?.message ?? 'Could not retry supplier research' };
    }
    return { error: 'Could not retry supplier research' };
  }
}

/** "Email" button on a supplier row -- sends for real regardless of the worker's EMAIL_DELIVERY_MODE. */
export async function manualEmail(requestId: string, lineId: string, notificationId: string, _previous: ManualOutreachState): Promise<ManualOutreachState> {
  void _previous;
  try {
    await api(`/sourcing-requests/${requestId}/lines/${lineId}/notifications/${notificationId}/manual-email`, { method: 'POST' });
    revalidatePath(`/sourcing/${requestId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { message?: string } | null;
      return { error: body?.message ?? 'Could not send the email' };
    }
    return { error: 'Could not send the email' };
  }
}

/** "Call" button on a supplier row -- dials for real regardless of the worker's VOICE_DELIVERY_MODE. */
export async function manualCall(requestId: string, lineId: string, notificationId: string, _previous: ManualOutreachState): Promise<ManualOutreachState> {
  void _previous;
  try {
    await api(`/sourcing-requests/${requestId}/lines/${lineId}/notifications/${notificationId}/manual-call`, { method: 'POST' });
    revalidatePath(`/sourcing/${requestId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { message?: string } | null;
      return { error: body?.message ?? 'Could not place the call' };
    }
    return { error: 'Could not place the call' };
  }
}

export async function recordPurchaseOrderOutcome(requestId: string, lineId: string, purchaseOrderId: string, _previous: RecordOutcomeState, formData: FormData): Promise<RecordOutcomeState> {
  void _previous;
  const numberOrNull = (name: string) => {
    const value = String(formData.get(name) ?? '').trim();
    return value ? Number(value) : null;
  };
  const localDate = (name: string) => {
    const value = String(formData.get(name) ?? '').trim();
    return value ? new Date(value).toISOString() : null;
  };
  const payload = {
    type: String(formData.get('type') ?? ''),
    promisedAt: localDate('promisedAt'),
    occurredAt: localDate('occurredAt') ?? undefined,
    quantity: numberOrNull('quantity'),
    rating: numberOrNull('rating'),
    reasonCode: String(formData.get('reasonCode') ?? '') || null,
    notes: String(formData.get('notes') ?? '') || null,
  };
  try {
    await api(`/sourcing-requests/${requestId}/lines/${lineId}/purchase-orders/${purchaseOrderId}/outcomes`, { method: 'POST', body: JSON.stringify(payload) });
    revalidatePath(`/sourcing/${requestId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) return { error: (error.body as { message?: string } | null)?.message ?? 'Could not record this outcome' };
    return { error: 'Could not record this outcome' };
  }
}
