'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';

const Line = z.object({
  description: z.string().trim().min(1, 'Description is required'),
  categoryId: z.uuid('Pick a category'),
  qty: z.coerce.number().positive('Quantity must be greater than 0'),
  uom: z.string().trim().min(1, 'Unit is required'),
  deliveryCity: z.string().trim().min(1, 'City is required'),
  deliveryState: z.string().trim().min(1, 'State is required'),
  needBy: z.string().trim().optional(),
  inviteEmails: z.string().trim().optional(),
});

const Form = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  lines: z.array(Line).min(1),
});

export type CreateManualState = { error?: string; fieldErrors?: Record<string, string> };

export async function createManualSourcingRequest(input: unknown): Promise<CreateManualState> {
  const parsed = Form.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the form' };

  // redirect() throws internally to perform the navigation, so it must run outside this try/catch --
  // otherwise the catch below would treat that as a failure and swallow the redirect.
  let sourcingRequestId: string;
  try {
    const res = await api<{ sourcingRequestId: string }>('/sourcing-requests', {
      method: 'POST',
      body: JSON.stringify({
        title: parsed.data.title,
        lines: parsed.data.lines.map((l) => ({
          ...l,
          needBy: l.needBy || undefined,
          inviteEmails: l.inviteEmails ? l.inviteEmails.split(/[,;]/).map((e) => e.trim()).filter(Boolean) : undefined,
        })),
      }),
    });
    sourcingRequestId = res.sourcingRequestId;
  } catch (err) {
    if (err instanceof ApiError) return { error: (err.body as { message?: string })?.message ?? 'Could not create the request' };
    throw err;
  }
  redirect(`/sourcing/${sourcingRequestId}`);
}
