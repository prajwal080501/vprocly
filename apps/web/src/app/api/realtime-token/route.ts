import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.accessToken || token.error) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const configuredUrl = process.env.PUBLIC_API_URL ?? process.env.API_URL;
  if (!configuredUrl) {
    return NextResponse.json({ message: 'Realtime endpoint is not configured' }, { status: 503 });
  }

  const endpoint = new URL(configuredUrl);
  endpoint.pathname = '';
  endpoint.search = '';
  endpoint.hash = '';
  return NextResponse.json(
    { token: token.accessToken, endpoint: endpoint.toString().replace(/\/$/, '') },
    { headers: { 'cache-control': 'no-store' } },
  );
}
