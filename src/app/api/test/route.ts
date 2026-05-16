export async function GET() {
  const results: Record<string, string> = {};
  
  // Test 1: Can we load @prisma/client?
  try {
    await import('@prisma/client');
    results.prisma_client = 'OK';
  } catch (e: unknown) {
    results.prisma_client = String(e instanceof Error ? e.message : e);
  }

  // Test 2: Can we load our prisma singleton?
  try {
    await import('@/lib/prisma');
    results.prisma_singleton = 'OK';
  } catch (e: unknown) {
    results.prisma_singleton = String(e instanceof Error ? e.message : e);
  }

  // Test 3: Can we load next-auth?
  try {
    await import('next-auth');
    results.nextauth = 'OK';
  } catch (e: unknown) {
    results.nextauth = String(e instanceof Error ? e.message : e);
  }

  // Test 4: Can we load our auth?
  try {
    await import('@/lib/auth');
    results.auth = 'OK';
  } catch (e: unknown) {
    results.auth = String(e instanceof Error ? e.message : e);
  }

  // Env check
  results.has_database_url = process.env.DATABASE_URL ? 'YES' : 'NO';
  results.has_auth_secret = process.env.AUTH_SECRET ? 'YES' : 'NO';

  return Response.json(results);
}
