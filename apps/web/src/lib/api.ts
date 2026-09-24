import 'server-only';
import { getToken } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/** Reads the access token from the encrypted session cookie (server side only). */
async function accessToken(): Promise<string | null> {
  // next-auth v4 reads req.cookies.getAll(), which Next's cookie store provides.
  const token = await getToken({
    req: { cookies: await cookies(), headers: await headers() } as never,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.accessToken || token.error) return null;
  return token.accessToken;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
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
