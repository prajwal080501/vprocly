'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export async function reviewItemEquivalence(id: string, status: 'approved' | 'rejected') {
  await api(`/operations/item-equivalences/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/operations');
}
