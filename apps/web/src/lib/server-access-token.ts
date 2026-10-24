import 'server-only';
import { cache } from 'react';
import { getToken } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';
import { refreshSessionToken } from './auth';

/**
 * Returns a usable API token for the current server render. `getToken()` only decrypts the session cookie;
 * it does not run NextAuth's JWT refresh callback. That meant every server-side API call started failing as
 * soon as Keycloak's 15-minute access token expired even though the refresh token was still valid.
 * React cache deduplicates refreshes when a page loads several API resources in parallel.
 */
export const serverAccessToken = cache(async (): Promise<string | null> => {
  const token = await getToken({
    req: { cookies: await cookies(), headers: await headers() } as never,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.accessToken) return null;

  const expiresAt = typeof token.expiresAt === 'number' ? token.expiresAt : 0;
  if (expiresAt && Date.now() / 1000 < expiresAt - 30 && !token.error) return token.accessToken;

  const refreshed = await refreshSessionToken(token);
  return refreshed.error ? null : refreshed.accessToken ?? null;
});
