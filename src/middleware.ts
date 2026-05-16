import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getPermissionKeyForRoute, getPermissionKeyForApiRoute } from '@/config/permission-keys';

const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/api/auth', '/api/sms/webhook'];

export default auth((req) => {
  const host = req.headers.get('host') ?? '';
  // Redirect QA subdomain to main site
  if (host.startsWith('qa.')) {
    return NextResponse.redirect('https://yourdebtcollectors.com/', 301);
  }

  const { pathname } = req.nextUrl;

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
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

  const permissions = (req.auth.user as { permissions?: string[] })?.permissions;

  // If permissions exist in the JWT, enforce them
  // If not (old session before permissions feature), allow through
  if (permissions && permissions.length > 0) {
    // Check page route permissions
    if (!pathname.startsWith('/api/')) {
      const permKey = getPermissionKeyForRoute(pathname);
      if (permKey && !permissions.includes(permKey)) {
        return NextResponse.redirect(new URL('/', req.url));
      }
    }

    // Check API route permissions
    if (pathname.startsWith('/api/')) {
      const permKey = getPermissionKeyForApiRoute(pathname);
      if (permKey && !permissions.includes(permKey)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|ico|svg|jpg|jpeg|gif|webp|woff|woff2|ttf|mp4|txt|xml)).*)', ],
};
