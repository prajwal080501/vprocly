'use server';

import { z } from 'zod';
import { PublicApiError, publicApi } from '@/lib/public-api';

const Form = z.object({
  name: z.string().trim().min(1, 'Company name is required'),
  gst: z.string().trim().min(1, 'GST number is required'),
  email: z.email('Enter a valid email'),
  categoryId: z.uuid('Pick a category'),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  country: z.string().trim().min(1, 'Country is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type SupplierSignupState = { error?: string; success?: true };

export async function signupSupplierSelf(_prev: SupplierSignupState, formData: FormData): Promise<SupplierSignupState> {
  const parsed = Form.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await publicApi('/supplier-signup', { method: 'POST', body: JSON.stringify(parsed.data) });
  } catch (err) {
    if (err instanceof PublicApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not create your account' };
    throw err;
  }
  return { success: true };
}
