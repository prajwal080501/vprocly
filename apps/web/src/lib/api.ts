import 'server-only';
import { redirect } from 'next/navigation';
import { serverAccessToken } from './server-access-token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await serverAccessToken();
  if (!token) redirect('/signin');
  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init.headers, authorization: `Bearer ${token}` },
  });
  if (res.status === 401) redirect('/signin');
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
