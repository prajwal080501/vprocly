import 'server-only';
import { redirect } from 'next/navigation';
import { serverAccessToken } from './server-access-token';

export class SupplierApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/** Same shape as lib/api.ts, but redirects to the supplier sign-in page, not the buyer one -- a supplier
 *  session is never a tenant login, so it has nowhere useful to go on /signin. */
export async function supplierApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await serverAccessToken();
  if (!token) redirect('/supplier/signin');
  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init.headers, authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) redirect('/supplier/signin');
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new SupplierApiError(res.status, body);
  return body as T;
}
