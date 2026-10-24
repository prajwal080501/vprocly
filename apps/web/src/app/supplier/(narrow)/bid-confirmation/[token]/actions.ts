'use server';

import { z } from 'zod';
import { PublicApiError, publicApi } from '@/lib/public-api';

const Form = z.object({
  unitPrice: z.coerce.number().positive('Enter a valid unit price'),
  minimumOrderQty: z.preprocess((value) => value === '' ? null : value, z.coerce.number().positive().nullable()),
  leadTimeDays: z.coerce.number().int().positive('Enter lead time in days'),
  currency: z.string().trim().length(3),
  taxPercent: z.preprocess((value) => value === '' ? null : value, z.coerce.number().min(0).max(100).nullable()),
  freightAmount: z.preprocess((value) => value === '' ? null : value, z.coerce.number().min(0).nullable()),
  quoteValidityDate: z.preprocess((value) => value === '' ? null : value, z.iso.date().nullable()),
  notes: z.preprocess((value) => value === '' ? null : value, z.string().trim().max(2000).nullable()),
});

export type ConfirmBidState = { error?: string; success?: true };

export async function confirmVoiceBid(token: string, _previous: ConfirmBidState, formData: FormData): Promise<ConfirmBidState> {
  const parsed = Form.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await publicApi(`/bid-confirmations/${token}/confirm`, { method: 'POST', body: JSON.stringify(parsed.data) });
    return { success: true };
  } catch (error) {
    if (error instanceof PublicApiError) return { error: (error.body as { message?: string })?.message ?? 'Could not confirm this bid' };
    throw error;
  }
}
