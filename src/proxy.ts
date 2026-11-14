import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getPermissionKeyForRoute, getPermissionKeyForApiRoute } from '@/config/permission-keys';

const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/api/auth', '/api/sms/webhook'];

// Matched exactly, never by prefix. These four carry their own Bearer-secret
// auth; a prefix entry for /api/scrape would also exempt the admin routes that
// live under it, leaving request creation and cancellation open to anyone.
const publicExactRoutes = [
  '/api/scrape/worker/lease',
  '/api/scrape/worker/results',
  '/api/scrape/worker/fail',
  '/api/scrape/worker/finish',
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  if (publicExactRoutes.includes(pathname.replace(/\/+$/, ''))) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login (pages) or 401 (API)
  if (!req.auth) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A session without permissions gets none. Treating an empty list as
  // "allow everything" let any role with no enabled permissions (e.g. a
  // Disabled or Importer account) skip every route check.
  const permissions = (req.auth.user as { permissions?: string[] })?.permissions ?? [];

  if (!pathname.startsWith('/api/')) {
    const permKey = getPermissionKeyForRoute(pathname);
    if (permKey && !permissions.includes(permKey)) {
      // Denied pages fall back to '/'. If '/' itself is denied the account has
      // no usable access, and redirecting to '/' again would loop forever.
      const fallback = pathname === '/' ? '/login' : '/';
      return NextResponse.redirect(new URL(fallback, req.url));
    }
  } else {
    const permKey = getPermissionKeyForApiRoute(pathname);
    if (permKey && !permissions.includes(permKey)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|ico|svg|jpg|jpeg|gif|webp|woff|woff2|ttf|mp4|txt|xml)).*)', ],
};
