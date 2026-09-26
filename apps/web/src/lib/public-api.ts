import 'server-only';

/**
 * For public, unauthenticated API calls only (categories, supplier invite view/signup) -- no session cookie,
 * no redirect-to-signin on 401. A supplier reaching an invite link is never logged into any buyer tenant.
 */
export class PublicApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

export async function publicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new PublicApiError(res.status, body);
  return body as T;
}
