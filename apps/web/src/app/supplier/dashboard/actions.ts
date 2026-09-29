'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupplierApiError, supplierApi } from '@/lib/supplier-api';

const Form = z.object({
  unitPrice: z.coerce.number().positive('Enter a valid price'),
  minimumOrderQty: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().positive('Enter a valid minimum quantity').optional()),
  leadTimeDays: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().optional()),
  notes: z.string().trim().max(2000).optional(),
});

export type PlaceBidState = { error?: string; success?: true };
export type UpdatePhoneState = { error?: string; success?: boolean };

export async function placeBid(sourcingLineId: string, _prev: PlaceBidState, formData: FormData): Promise<PlaceBidState> {
  const parsed = Form.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await supplierApi(`/supplier/lines/${sourcingLineId}/bids`, {
      method: 'POST',
      body: JSON.stringify({
        unitPrice: parsed.data.unitPrice,
        minimumOrderQty: parsed.data.minimumOrderQty ?? null,
        leadTimeDays: parsed.data.leadTimeDays ?? null,
        notes: parsed.data.notes ?? null,
      }),
    });
  } catch (err) {
    if (err instanceof SupplierApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not place your bid' };
    throw err;
  }
  revalidatePath('/supplier/dashboard');
  return { success: true };
}

export async function updateSupplierPhone(_previous: UpdatePhoneState, formData: FormData): Promise<UpdatePhoneState> {
  void _previous;
  const phone = String(formData.get('phone') ?? '').trim();
  try {
    await supplierApi('/supplier/me', { method: 'PATCH', body: JSON.stringify({ phone: phone || null }) });
  } catch (err) {
    if (err instanceof SupplierApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not update your mobile number' };
    throw err;
  }
  revalidatePath('/supplier/dashboard');
  return { success: true };
}
