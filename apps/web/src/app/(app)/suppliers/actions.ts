'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';

const Form = z.object({
  code: z.string().trim().min(1, 'Code is required'),
  name: z.string().trim().min(1, 'Name is required'),
  taxId: z.string().trim().optional(),
  email: z.union([z.literal(''), z.email('Invalid email')]).optional(),
});

export type CreateSupplierState = { error?: string; ok?: boolean };

export async function createSupplier(_: CreateSupplierState, formData: FormData): Promise<CreateSupplierState> {
  const parsed = Form.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { email, taxId, ...rest } = parsed.data;
  try {
    await api('/suppliers', {
      method: 'POST',
      body: JSON.stringify({ ...rest, ...(taxId ? { taxId } : {}), ...(email ? { email } : {}) }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return { error: 'A supplier with this code already exists' };
    if (err instanceof ApiError && err.status === 403) return { error: 'You do not have permission to add suppliers' };
    throw err;
  }
  revalidatePath('/suppliers');
  return { ok: true };
}
