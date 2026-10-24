'use server';

import { z } from 'zod';
import { PublicApiError, publicApi } from '@/lib/public-api';

const Form = z.object({
  name: z.string().trim().min(1, 'Company name is required'),
  gst: z.string().trim().max(32).optional().transform((value) => value || undefined),
  phone: z.string().trim().max(32).refine((value) => !value || value.length >= 8, 'Enter a valid mobile number').transform((value) => value || undefined),
  email: z.email('Enter a valid email'),
  categories: z.array(z.string().trim().min(1)).min(1, 'Select at least one category').max(20),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  country: z.string().trim().min(1, 'Country is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  verificationToken: z.string().min(32, 'Verify your email before creating the account'),
});

export type SupplierSignupState = { error?: string; success?: { email: string } };
export type SupplierOtpRequestState = { error?: string; sent?: boolean };
export type SupplierOtpVerifyState = { error?: string; verificationToken?: string };

export async function requestSupplierOtp(_prev: SupplierOtpRequestState, formData: FormData): Promise<SupplierOtpRequestState> {
  const email = z.email('Enter a valid email').safeParse(String(formData.get('email') ?? '').trim());
  if (!email.success) return { error: email.error.issues[0]?.message };
  try {
    await publicApi('/supplier-signup/otp/request', { method: 'POST', body: JSON.stringify({ email: email.data }) });
    return { sent: true };
  } catch (err) {
    if (err instanceof PublicApiError) return { ..._prev, error: (err.body as { message?: string })?.message ?? 'Could not send the code' };
    throw err;
  }
}

export async function verifySupplierOtp(_prev: SupplierOtpVerifyState, formData: FormData): Promise<SupplierOtpVerifyState> {
  const parsed = z.object({
    email: z.email('Enter a valid email'),
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code'),
  }).safeParse({ email: String(formData.get('email') ?? '').trim(), code: String(formData.get('otpCode') ?? '') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    const result = await publicApi<{ verificationToken: string }>('/supplier-signup/otp/verify', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    return { verificationToken: result.verificationToken };
  } catch (err) {
    if (err instanceof PublicApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not verify the code' };
    throw err;
  }
}

export async function signupSupplierSelf(_prev: SupplierSignupState, formData: FormData): Promise<SupplierSignupState> {
  const parsed = Form.safeParse({ ...Object.fromEntries(formData), categories: formData.getAll('categories').map(String) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await publicApi('/supplier-signup', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
  } catch (err) {
    if (err instanceof PublicApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not create your account' };
    throw err;
  }
  return { success: { email: parsed.data.email } };
}
