import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const operationsUrl = process.env.OPERATIONS_URL;
  if (!operationsUrl) return NextResponse.next();

  const operations = new URL(operationsUrl);
  const requestHost = request.headers.get('host')?.toLowerCase();
  const onOperationsHost = requestHost === operations.host.toLowerCase();
  const { pathname } = request.nextUrl;

  if (onOperationsHost && pathname === '/') {
    const rewrite = request.nextUrl.clone();
    rewrite.pathname = '/operations';
    return NextResponse.rewrite(rewrite);
  }

  if (!onOperationsHost && (pathname === '/operations' || pathname.startsWith('/operations/'))) {
    return NextResponse.redirect(operations);
  }

  if (onOperationsHost && !pathname.startsWith('/operations') && !pathname.startsWith('/api/') && !pathname.startsWith('/_next/')) {
    const mainApp = new URL(process.env.NEXTAUTH_URL ?? request.url);
    mainApp.pathname = pathname;
    mainApp.search = request.nextUrl.search;
    return NextResponse.redirect(mainApp);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!favicon.ico|brand-mark.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'],
};
