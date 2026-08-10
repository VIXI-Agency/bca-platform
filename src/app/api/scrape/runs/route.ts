import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/scrape-admin';
import { reasonsInGroup, type OutcomeGroup } from '@/lib/scrape-outcomes';

/**
 * Run history, all-time totals, and how much queue is left.
 *
 * Split out of /api/scrape/requests, which returned the ten most recent runs
 * and nothing else: older runs were unreachable, there was no total to compare
 * a run against, and nothing said how long the queue would last.
 */

const PAGE_SIZE = 15;

/** Searches an industry must have had before its yield is worth judging. */
const YIELD_SAMPLE_MIN = 50;

/** Industries listed as the weakest earners. */
const WORST_SHOWN = 6;

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
    const outcome = (params.get('outcome') ?? 'all') as OutcomeGroup;

    const reasons = reasonsInGroup(outcome);
    // A running run has no finishReason yet, so it belongs to no bucket but
    // should still show under "all" — otherwise the run happening right now
    // disappears the moment somebody touches the filter.
    const where = reasons ? { finishReason: { in: reasons } } : {};

    const [runs, total, runAggregate, runCount, taskCounts, industryTotals] = await Promise.all([
      prisma.scrapeRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.scrapeRun.count({ where }),
      prisma.scrapeRun.aggregate({
        _sum: {
          leadsFound: true,
          leadsImported: true,
          duplicates: true,
          blacklisted: true,
          invalid: true,
          tasksDone: true,
        },
        _min: { startedAt: true },
      }),
      prisma.scrapeRun.count(),
      prisma.scrapeTask.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.scrapeTask.groupBy({
        by: ['industry', 'source'],
        where: { status: 'done' },
        _count: { _all: true },
        _sum: { foundCount: true, importedCount: true },
      }),
    ]);

    const sums = runAggregate._sum;
    const found = sums.leadsFound ?? 0;
    const imported = sums.leadsImported ?? 0;

    const byStatus = new Map(taskCounts.map((row) => [row.status, row._count._all]));
    const pending = byStatus.get('pending') ?? 0;

    // Average over runs that actually worked. Including aborted runs, which do
    // 10 searches before stopping, would halve the average and overstate how
    // long the queue lasts.
    const productiveRuns = await prisma.scrapeRun.findMany({
      where: { status: 'finished', finishReason: { in: ['target', 'budget'] } },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { tasksDone: true },
    });
    const searchesPerRun = productiveRuns.length
      ? Math.round(productiveRuns.reduce((n, r) => n + r.tasksDone, 0) / productiveRuns.length)
      : 0;

    const nextUp = await prisma.scrapeTask.findFirst({
      where: { status: 'pending', request: { status: 'active' } },
      orderBy: { id: 'asc' },
      select: { industry: true },
    });

    const pendingIndustries = await prisma.scrapeTask.groupBy({
      by: ['industry'],
      where: { status: 'pending', request: { status: 'active' } },
      _count: { _all: true },
    });

    // Yield is what tells an admin which industries are not worth queueing
    // again. Mud Jacking spent 231 searches to import one lead; nothing on the
    // page said so, so it would have been queued again.
    // Per source, not blended. An industry exhausted on one directory can be
    // productive on the other, and one averaged ratio describes neither -- it
    // would recommend against queueing exactly the work worth queueing.
    const worstIndustries = industryTotals
      .map((row) => ({
        industry: row.industry,
        source: row.source,
        searches: row._count._all,
        found: row._sum.foundCount ?? 0,
        imported: row._sum.importedCount ?? 0,
      }))
      .filter((row) => row.searches >= YIELD_SAMPLE_MIN)
      .sort((a, b) => a.imported / a.searches - b.imported / b.searches)
      .slice(0, WORST_SHOWN);

    return NextResponse.json({
      runs,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      summary: {
        runs: runCount,
        searches: sums.tasksDone ?? 0,
        found,
        imported,
        duplicates: sums.duplicates ?? 0,
        blacklisted: sums.blacklisted ?? 0,
        invalid: sums.invalid ?? 0,
        duplicateRate: found > 0 ? Math.round(((sums.duplicates ?? 0) / found) * 100) : 0,
        importedPerRun: runCount > 0 ? Math.round(imported / runCount) : 0,
        since: runAggregate._min.startedAt,
      },
      queue: {
        pending,
        done: byStatus.get('done') ?? 0,
        failed: byStatus.get('failed') ?? 0,
        leased: byStatus.get('leased') ?? 0,
        industriesRemaining: pendingIndustries.length,
        nextIndustry: nextUp?.industry ?? null,
        searchesPerRun,
        // Four runs a day, six hours apart. Deliberately floored: telling an
        // admin they have one day left when the truth is 1.9 is the safe error.
        runsRemaining: searchesPerRun > 0 ? Math.floor(pending / searchesPerRun) : null,
        daysRemaining: searchesPerRun > 0 ? Math.floor(pending / (searchesPerRun * 4)) : null,
      },
      worstIndustries,
    });
  } catch (error) {
    console.error('GET /api/scrape/runs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
