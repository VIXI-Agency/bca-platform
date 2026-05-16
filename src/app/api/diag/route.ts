// Diagnostic endpoint - public, no auth, remove after debugging
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function GET() {
  const cwd = process.cwd();
  const results: Record<string, string> = {
    node_version: process.version,
    platform: process.platform,
    cwd,
    has_database_url: process.env.DATABASE_URL ? 'YES' : 'NO',
    db_url_prefix: process.env.DATABASE_URL?.split(';')[0] ?? 'NONE',
  };

  // Check .prisma/client directory
  const prismaCacheDir = path.join(cwd, 'node_modules', '.prisma', 'client');
  if (fs.existsSync(prismaCacheDir)) {
    results.prisma_cache_dir = fs.readdirSync(prismaCacheDir).join(' | ');
  } else {
    results.prisma_cache_dir = 'NOT FOUND at ' + prismaCacheDir;
  }

  // Check @prisma/client directory
  const prismaClientDir = path.join(cwd, 'node_modules', '@prisma', 'client');
  if (fs.existsSync(prismaClientDir)) {
    results.prisma_pkg_dir = fs.readdirSync(prismaClientDir).slice(0, 10).join(' | ');
  } else {
    results.prisma_pkg_dir = 'NOT FOUND';
  }

  // Check for .exe or .node engine files
  const engineFiles: string[] = [];
  const searchDirs = [
    path.join(cwd, 'node_modules', '.prisma'),
    path.join(cwd, 'node_modules', '@prisma'),
  ];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const walk = (d: string) => {
        for (const f of fs.readdirSync(d)) {
          const fp = path.join(d, f);
          const stat = fs.statSync(fp);
          if (stat.isDirectory()) walk(fp);
          else if (f.endsWith('.exe') || f.endsWith('.node') || f.includes('query_engine')) {
            engineFiles.push(fp.replace(cwd, '') + ` (${Math.round(stat.size / 1024)}KB)`);
          }
        }
      };
      walk(dir);
    } catch (e) { /* ignore */ }
  }
  results.engine_files = engineFiles.length > 0 ? engineFiles.join(' | ') : 'NONE FOUND';

  // Try PRISMA_QUERY_ENGINE_BINARY env var path
  const customBinary = process.env.PRISMA_QUERY_ENGINE_BINARY;
  results.custom_binary_env = customBinary ?? 'not set';
  if (customBinary) {
    results.custom_binary_exists = fs.existsSync(customBinary) ? 'YES' : 'NO';
  }

  // Try spawning a trivial child process to verify spawn works at all
  try {
    const out = execSync('echo hello', { encoding: 'utf8', timeout: 5000 });
    results.spawn_test = 'OK: ' + out.trim();
  } catch (e: unknown) {
    results.spawn_test = String(e instanceof Error ? e.message : e);
  }

  // Prisma connect
  try {
    const { PrismaClient } = await import('@prisma/client');
    results.prisma_import = 'OK';
    const client = new PrismaClient({ log: ['error'] });
    try {
      await client.$connect();
      results.prisma_connect = 'OK';
      await client.$disconnect().catch(() => {});
    } catch (e: unknown) {
      results.prisma_connect = String(e instanceof Error ? `${e.message}\n${(e as NodeJS.ErrnoException).code ?? ''}` : e);
    }
  } catch (e: unknown) {
    results.prisma_import = String(e instanceof Error ? e.message : e);
  }

  return Response.json(results, { status: 200 });
}
