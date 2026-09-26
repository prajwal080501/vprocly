'use server';

import { z } from 'zod';
import { PublicApiError, publicApi } from '@/lib/public-api';

const Form = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  adminName: z.string().trim().min(1, 'Your name is required'),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type SignupState = { error?: string; success?: true };

export async function signupOrganization(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = Form.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await publicApi('/organizations/signup', { method: 'POST', body: JSON.stringify(parsed.data) });
  } catch (err) {
    if (err instanceof PublicApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not create your account' };
    throw err;
  }
  // The password never needs to come back to the client: Keycloak's hosted login (signup-form.tsx redirects
  // there next) is its own page, so the user re-enters it there regardless -- no reason to round-trip it.
  return { success: true };
}
