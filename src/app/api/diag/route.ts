// Diagnostic endpoint - public, no auth required
// Remove after debugging is complete
export async function GET() {
  const results: Record<string, string> = {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    has_database_url: process.env.DATABASE_URL ? 'YES' : 'NO',
    has_auth_secret: (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) ? 'YES' : 'NO',
  };

  try {
    const { PrismaClient } = await import('@prisma/client');
    results.prisma_import = 'OK';
    try {
      const client = new PrismaClient();
      results.prisma_new = 'OK';
      try {
        await client.$connect();
        results.prisma_connect = 'OK';
        await client.$disconnect();
      } catch (e: unknown) {
        results.prisma_connect = String(e instanceof Error ? e.message : e);
      }
    } catch (e: unknown) {
      results.prisma_new = String(e instanceof Error ? e.message : e);
    }
  } catch (e: unknown) {
    results.prisma_import = String(e instanceof Error ? e.message : e);
  }

  try {
    await import('next-auth');
    results.nextauth_import = 'OK';
  } catch (e: unknown) {
    results.nextauth_import = String(e instanceof Error ? e.message : e);
  }

  try {
    await import('@/lib/auth');
    results.auth_module = 'OK';
  } catch (e: unknown) {
    results.auth_module = String(e instanceof Error ? e.message : e);
  }

  return Response.json(results, { status: 200 });
}
