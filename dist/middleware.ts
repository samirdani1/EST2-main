// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('__session'); // Firebase use ce cookie par défaut pour le SSR
  const { pathname } = request.nextUrl;

  // 1. Autoriser l'accès à la page login et aux assets statiques
  if (pathname.startsWith('/login') || pathname.startsWith('/_next') || pathname.includes('/api/')) {
    return NextResponse.next();
  }

  // 2. Rediriger vers login si aucune session n'est présente
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
