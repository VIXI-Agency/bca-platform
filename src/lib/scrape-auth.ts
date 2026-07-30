import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Bearer-secret auth for the scraper worker routes.
 *
 * Fails closed: with SCRAPER_API_SECRET unset every request is rejected.
 * /api/sms/webhook wraps its equivalent check in `if (WEBHOOK_SECRET)`, so it
 * runs unauthenticated whenever the variable is missing, which is its current
 * state in production. Do not copy that shape.
 *
 * Returns a response to send back, or null when the caller is authorized.
 */
export function requireWorkerAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.SCRAPER_API_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Scraper API is not configured' }, { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!secretsMatch(token, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Hashes first so the comparison is constant-time and leaks no length. */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
