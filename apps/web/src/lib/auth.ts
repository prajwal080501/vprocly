import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import KeycloakProvider from 'next-auth/providers/keycloak';

const issuer = process.env.OIDC_ISSUER!;

async function refresh(token: JWT): Promise<JWT> {
  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.OIDC_CLIENT_ID!,
      client_secret: process.env.OIDC_CLIENT_SECRET!,
      refresh_token: token.refreshToken!,
    }),
  });
  if (!res.ok) return { ...token, error: 'RefreshFailed' };
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    ...token,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? token.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + t.expires_in,
    error: undefined,
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      issuer,
      clientId: process.env.OIDC_CLIENT_ID!,
      clientSecret: process.env.OIDC_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      if (token.expiresAt && Date.now() / 1000 < token.expiresAt - 30) return token;
      return refresh(token);
    },
    // Tokens stay in the encrypted cookie; the browser session only gets identity and error state.
    async session({ session, token }) {
      return { ...session, error: token.error };
    },
  },
};

declare module 'next-auth' {
  interface Session {
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
