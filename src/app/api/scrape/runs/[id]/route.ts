import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/scrape-admin';

/**
 * What one run actually did, industry by industry.
 *
 * "407 imported" was the entire story a run told, which answers how many and
 * nothing else. Every task already records its industry, city, state and both
 * counts, so the breakdown needed no new data — only somebody to ask for it.
 */

/** Cities listed per run. Enough to see where the leads came from. */
const CITIES_SHOWN = 10;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const runId = Number(id);
    if (!Number.isInteger(runId) || runId <= 0) {
      return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
    }

    const run = await prisma.scrapeRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: 'Unknown run' }, { status: 404 });
    }

    const [byIndustry, byCity, byZone, bySource, failures] = await Promise.all([
      prisma.scrapeTask.groupBy({
        by: ['industry'],
        where: { idRun: runId, status: 'done' },
        _count: { _all: true },
        _sum: { foundCount: true, importedCount: true },
      }),
      prisma.scrapeTask.groupBy({
        by: ['city', 'state'],
        where: { idRun: runId, status: 'done' },
        _sum: { importedCount: true },
        orderBy: { _sum: { importedCount: 'desc' } },
        take: CITIES_SHOWN,
      }),
      prisma.scrapeTask.groupBy({
        by: ['timeZone'],
        where: { idRun: runId, status: 'done' },
        _count: { _all: true },
        _sum: { importedCount: true },
      }),
      // The duplicate rate per source is what says whether a directory still
      // pays. It only exists per task; the run counters cannot be split.
      prisma.scrapeTask.groupBy({
        by: ['source'],
        where: { idRun: runId, status: 'done' },
        _count: { _all: true },
        _sum: { foundCount: true, importedCount: true, duplicateCount: true },
      }),
      prisma.scrapeTask.findMany({
        where: { idRun: runId, status: 'failed' },
        select: { id: true, industry: true, city: true, state: true, attempts: true, lastError: true },
        take: 10,
      }),
    ]);

    const sources = bySource
      .map((row) => {
        const found = row._sum.foundCount ?? 0;
        const duplicates = row._sum.duplicateCount ?? 0;
        return {
          source: row.source,
          searches: row._count._all,
          found,
          imported: row._sum.importedCount ?? 0,
          duplicates,
          duplicateRate: found > 0 ? Math.round((duplicates / found) * 100) : 0,
        };
      })
      .sort((a, b) => b.imported - a.imported);

    const industries = byIndustry
      .map((row) => ({
        industry: row.industry,
        searches: row._count._all,
        found: row._sum.foundCount ?? 0,
        imported: row._sum.importedCount ?? 0,
      }))
      .sort((a, b) => b.imported - a.imported || b.found - a.found);

    return NextResponse.json({
      run,
      sources,
      industries,
      cities: byCity.map((row) => ({
        city: row.city,
        state: row.state.trim(),
        imported: row._sum.importedCount ?? 0,
      })),
      zones: byZone
        .map((row) => ({
          timeZone: row.timeZone,
          searches: row._count._all,
          imported: row._sum.importedCount ?? 0,
        }))
        .sort((a, b) => b.imported - a.imported),
      failures: failures.map((task) => ({ ...task, state: task.state.trim() })),
    });
  } catch (error) {
    console.error('GET /api/scrape/runs/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
