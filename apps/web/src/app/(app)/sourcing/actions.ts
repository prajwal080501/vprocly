'use server';

import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/lib/api';

export type DeleteSourcingRequestResult = { error?: string };

export async function deleteSourcingRequest(id: string): Promise<DeleteSourcingRequestResult> {
  try {
    await api(`/sourcing-requests/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (err instanceof ApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not delete the request' };
    throw err;
  }
  revalidatePath('/sourcing');
  return {};
}
