'use server';

import { z } from 'zod';
import { PublicApiError, publicApi } from '@/lib/public-api';

const Form = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  gst: z.string().trim().min(1, 'GST number is required'),
  categoryId: z.uuid('Pick a category'),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type SignupState = { error?: string; success?: { walletBalance: number } };

export async function signupSupplier(token: string, _prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = Form.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    const res = await publicApi<{ walletBalance: number }>(`/invites/${token}/signup`, {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    return { success: { walletBalance: res.walletBalance } };
  } catch (err) {
    if (err instanceof PublicApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not sign up' };
    throw err;
  }
}
