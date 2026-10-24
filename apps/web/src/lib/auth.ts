import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import KeycloakProvider from 'next-auth/providers/keycloak';

const issuer = process.env.OIDC_ISSUER!;
// Server-side calls (discovery, token exchange, refresh) may need an internal URL; the browser and the
// token's `iss` always use the public issuer.
const internalIssuer = process.env.OIDC_INTERNAL_ISSUER ?? issuer;
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;

type AccountKind = 'buyer' | 'supplier';

function accountKind(accessToken: string | undefined): AccountKind | undefined {
  if (!accessToken) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8')) as {
      tenant_id?: string;
      platform_supplier_id?: string;
    };
    if (payload.platform_supplier_id) return 'supplier';
    if (payload.tenant_id) return 'buyer';
  } catch {
    // Token verification remains the API's responsibility; this hint only chooses the correct route group.
  }
  return undefined;
}

export async function refreshSessionToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) return { ...token, error: 'RefreshFailed' };
  try {
    const res = await fetch(`${internalIssuer}/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.OIDC_CLIENT_ID!,
        client_secret: process.env.OIDC_CLIENT_SECRET!,
        refresh_token: token.refreshToken,
      }),
    });
    if (!res.ok) return { ...token, error: 'RefreshFailed' };
    const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    return {
      ...token,
      accessToken: t.access_token,
      accountKind: accountKind(t.access_token),
      refreshToken: t.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + t.expires_in,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshFailed' };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      issuer,
      wellKnown: `${internalIssuer}/.well-known/openid-configuration`,
      clientId: process.env.OIDC_CLIENT_ID!,
      clientSecret: process.env.OIDC_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  cookies: cookieDomain ? {
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: { domain: cookieDomain, httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    },
  } : undefined,
  pages: { signIn: '/signin' },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      const allowedOrigins = [baseUrl, process.env.OPERATIONS_URL]
        .filter((value): value is string => Boolean(value))
        .map((value) => new URL(value).origin);
      return allowedOrigins.includes(new URL(url).origin) ? url : baseUrl;
    },
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          accountKind: accountKind(account.access_token),
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      if (token.expiresAt && Date.now() / 1000 < token.expiresAt - 30) {
        return token.accountKind ? token : { ...token, accountKind: accountKind(token.accessToken) };
      }
      return refreshSessionToken(token);
    },
    // Tokens stay in the encrypted cookie; the browser session only gets identity and error state.
    async session({ session, token }) {
      return { ...session, error: token.error, accountKind: token.accountKind };
    },
  },
};

declare module 'next-auth' {
  interface Session {
    error?: string;
    accountKind?: AccountKind;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
    accountKind?: AccountKind;
  }
}
