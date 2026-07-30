import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Session-and-role gate for the scrape admin routes.
 *
 * The permission key on the nav entry controls menu visibility and middleware
 * routing only. Authorization in this codebase is the role check each handler
 * runs, the same shape /api/import and the blacklist routes use.
 *
 * Returns a response to send back, or null when the caller is authorized.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role: number }).role;
  if (role !== 1) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function currentUserName(): Promise<string> {
  const session = await auth();
  return session?.user?.name || session?.user?.email || 'Unknown';
}
