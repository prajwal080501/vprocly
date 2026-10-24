'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupplierApiError, supplierApi } from '@/lib/supplier-api';
import type { DetectedLocation, RefillCurrency, SupplierNetworkInsights } from '@/lib/types';

const Form = z.object({
  unitPrice: z.coerce.number().positive('Enter a valid price'),
  minimumOrderQty: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().positive('Enter a valid minimum quantity').optional()),
  leadTimeDays: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().optional()),
  notes: z.string().trim().max(2000).optional(),
});

export type PlaceBidState = { error?: string; success?: true };
export type UpdatePassportState = { error?: string; success?: boolean };
export type UpdateNetworkState = { error?: string; success?: boolean };
export type ClarificationState = { error?: string; success?: boolean };

export type RefillOrder = { orderId: string; amount: number; currency: string; points: number };
export type RefillConfirmation = { walletBalance: number; pointsAdded: number; alreadyCredited: boolean };
type ActionResult<T> = { data: T } | { error: string };

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

export async function sendSupplierClarification(
  sourcingLineId: string,
  _previous: ClarificationState,
  formData: FormData,
): Promise<ClarificationState> {
  const message = String(formData.get('message') ?? '').trim();
  if (!message) return { error: 'Enter a message' };
  if (message.length > 2000) return { error: 'Message must be 2000 characters or less' };
  try {
    await supplierApi(`/supplier/lines/${sourcingLineId}/clarifications`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    revalidatePath('/supplier/dashboard');
    return { success: true };
  } catch (error) {
    if (error instanceof SupplierApiError) return { error: (error.body as { message?: string })?.message ?? 'Could not send the message' };
    return { error: 'Could not send the message' };
  }
}

export async function setSupplierCapability(
  sourcingLineId: string,
  status: 'can_supply' | 'needs_clarification' | 'declined',
): Promise<{ error?: string }> {
  try {
    await supplierApi(`/supplier/lines/${sourcingLineId}/capability`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    revalidatePath('/supplier/dashboard');
    return {};
  } catch (error) {
    if (error instanceof SupplierApiError) return { error: (error.body as { message?: string })?.message ?? 'Could not update availability' };
    return { error: 'Could not update availability' };
  }
}

const csv = (value: FormDataEntryValue | null) => String(value ?? '').split(',').map((part) => part.trim()).filter(Boolean);

export async function updateSupplierPassport(_previous: UpdatePassportState, formData: FormData): Promise<UpdatePassportState> {
  const gstin = String(formData.get('gstin') ?? '').trim();
  const contactPhone = String(formData.get('contactPhone') ?? '').trim();
  const identifiers = gstin ? [{ type: 'gstin', value: gstin }] : [];
  const categoryIds = formData.getAll('categoryIds').map(String);
  const body = {
    identifiers,
    locations: [{ type: 'registered', label: 'Primary location', city: String(formData.get('city') ?? ''), state: String(formData.get('state') ?? ''), country: String(formData.get('country') ?? 'India'), isPrimary: true }],
    capabilities: categoryIds.map((categoryId) => ({ categoryId, materials: csv(formData.get('materials')) })),
    certifications: csv(formData.get('certifications')).map((name) => ({ name })),
    contacts: [{ email: String(formData.get('contactEmail') ?? '') || null, phone: contactPhone || null, preferredChannel: contactPhone ? 'voice' : 'email', isPrimary: true }],
  };
  try {
    await supplierApi('/supplier/passport', { method: 'PATCH', body: JSON.stringify(body) });
  } catch (error) {
    if (error instanceof SupplierApiError) return { error: (error.body as { message?: string })?.message ?? 'Could not update supplier passport' };
    throw error;
  }
  revalidatePath('/supplier/dashboard');
  return { success: true };
}

export async function updateNetworkPreferences(_previous: UpdateNetworkState, formData: FormData): Promise<UpdateNetworkState> {
  const digestFrequency = String(formData.get('digestFrequency') ?? 'instant') as SupplierNetworkInsights['preferences']['digestFrequency'];
  const minimumRecommendationScore = Number(formData.get('minimumRecommendationScore') ?? 0);
  try {
    await supplierApi('/supplier/network-preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        opportunityAlerts: digestFrequency !== 'off',
        digestFrequency,
        minimumRecommendationScore,
      }),
    });
  } catch (error) {
    if (error instanceof SupplierApiError) return { error: (error.body as { message?: string })?.message ?? 'Could not update opportunity alerts' };
    throw error;
  }
  revalidatePath('/supplier/dashboard');
  return { success: true };
}

function apiMessage(error: unknown, fallback: string) {
  return error instanceof SupplierApiError ? (error.body as { message?: string })?.message ?? fallback : fallback;
}

export async function createRefillOrder(packId: string, currency: RefillCurrency, customPoints?: number): Promise<ActionResult<RefillOrder>> {
  try {
    const data = await supplierApi<RefillOrder>('/supplier/wallet/refill-orders', {
      method: 'POST',
      body: JSON.stringify({ packId, currency, customPoints }),
    });
    return { data };
  } catch (error) {
    return { error: apiMessage(error, 'Could not create the payment order') };
  }
}

export async function confirmRefillPayment(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<ActionResult<RefillConfirmation>> {
  try {
    const data = await supplierApi<RefillConfirmation>('/supplier/wallet/refill-orders/confirm', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    revalidatePath('/supplier/dashboard');
    return { data };
  } catch (error) {
    return { error: apiMessage(error, 'Could not verify the payment') };
  }
}

export async function detectCheckoutLocation(latitude: number, longitude: number): Promise<ActionResult<DetectedLocation>> {
  try {
    const data = await supplierApi<DetectedLocation>('/supplier/location/detect', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
    });
    return { data };
  } catch (error) {
    return { error: apiMessage(error, 'Could not detect your location') };
  }
}
