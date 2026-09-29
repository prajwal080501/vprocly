'use server';

import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/lib/api';

export type UpdatePhoneState = { error?: string; success?: boolean };

export async function updateBuyerPhone(_previous: UpdatePhoneState, formData: FormData): Promise<UpdatePhoneState> {
  void _previous;
  const phone = String(formData.get('phone') ?? '').trim();
  try {
    await api('/me', { method: 'PATCH', body: JSON.stringify({ phone: phone || null }) });
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { message?: string } | null;
      return { error: body?.message ?? 'Could not update your mobile number' };
    }
    return { error: 'Could not update your mobile number' };
  }
  revalidatePath('/home');
  return { success: true };
}
