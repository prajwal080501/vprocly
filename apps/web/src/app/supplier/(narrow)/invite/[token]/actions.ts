'use server';

import { z } from 'zod';
import { PublicApiError, publicApi } from '@/lib/public-api';

const Form = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  gst: z.string().trim().max(32).optional().transform((value) => value || undefined),
  phone: z.string().trim().max(32).refine((value) => !value || value.length >= 8, 'Enter a valid mobile number').transform((value) => value || undefined),
  categories: z.array(z.string().trim().min(1)).min(1, 'Select at least one category').max(20),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  verificationToken: z.string().min(32, 'Verify your email before creating the account'),
});

export type SignupState = { error?: string; success?: { walletBalance: number } };
export type OtpRequestState = { error?: string; sent?: boolean };
export type OtpVerifyState = { error?: string; verificationToken?: string };

export async function requestInviteOtp(token: string, _prev: OtpRequestState): Promise<OtpRequestState> {
  try {
    await publicApi(`/invites/${token}/otp/request`, { method: 'POST', body: '{}' });
    return { sent: true };
  } catch (err) {
    if (err instanceof PublicApiError) return { ..._prev, error: (err.body as { message?: string })?.message ?? 'Could not send the code' };
    throw err;
  }
}

export async function verifyInviteOtp(token: string, _prev: OtpVerifyState, formData: FormData): Promise<OtpVerifyState> {
  const code = String(formData.get('otpCode') ?? '').trim();
  if (!/^\d{6}$/.test(code)) return { error: 'Enter the six-digit code' };
  try {
    const result = await publicApi<{ verificationToken: string }>(`/invites/${token}/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    return { verificationToken: result.verificationToken };
  } catch (err) {
    if (err instanceof PublicApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not verify the code' };
    throw err;
  }
}

export async function signupSupplier(token: string, _prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = Form.safeParse({ ...Object.fromEntries(formData), categories: formData.getAll('categories').map(String) });
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
