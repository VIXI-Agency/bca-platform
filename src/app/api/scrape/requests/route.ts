import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, currentUserName } from '@/lib/scrape-admin';

/**
 * How long a completed search keeps its industry+city off the queue.
 *
 * The trade is between wasting searches on a city that has barely changed and
 * missing businesses that registered since. Ninety days is roughly a quarter,
 * which is how often this catalog is worth revisiting; the duplicate counter on
 * the run history is the evidence for moving it either way.
 */
const COVERAGE_TTL_DAYS = 90;

/** Directories a search can read. Both queues one task per source per pair. */
export const SCRAPE_SOURCES = ['yp', 'sp'] as const;

const createSchema = z.object({
  industries: z.array(z.string().min(1)).min(1).max(200),
  states: z.array(z.string().length(2)).min(1).max(60),
  sources: z.array(z.enum(SCRAPE_SOURCES)).min(1).default(['yp']),
  maxPages: z.number().int().min(1).max(10).default(3),
  priority: z.number().int().min(0).max(100).default(0),
  preview: z.boolean().default(false),
});

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const [requests, runs, failed] = await Promise.all([
      prisma.scrapeRequest.findMany({
        where: { status: { in: ['active', 'paused'] } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.scrapeRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
      prisma.scrapeTask.findMany({
        where: { status: 'failed' },
        orderBy: { id: 'desc' },
        take: 25,
        select: { id: true, industry: true, city: true, state: true, attempts: true, lastError: true },
      }),
    ]);

    const counts = await prisma.scrapeTask.groupBy({
      by: ['idRequest', 'status'],
      where: { idRequest: { in: requests.map((r) => r.id) } },
      _count: { _all: true },
      _sum: { importedCount: true },
    });

    return NextResponse.json({
      requests: requests.map((r) => {
        const mine = counts.filter((c) => c.idRequest === r.id);
        const total = mine.reduce((n, c) => n + c._count._all, 0);
        const done = mine
          .filter((c) => c.status === 'done' || c.status === 'failed')
          .reduce((n, c) => n + c._count._all, 0);
        return {
          ...r,
          totalTasks: total,
          completedTasks: done,
          leadsImported: mine.reduce((n, c) => n + (c._sum.importedCount ?? 0), 0),
        };
      }),
      runs,
      failedTasks: failed.map((t) => ({ ...t, state: t.state.trim() })),
    });
  } catch (error) {
    console.error('GET /api/scrape/requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { industries, states, sources, maxPages, priority, preview } = parsed.data;

    const cities = await prisma.scrapeCity.findMany({
      where: { state: { in: states } },
      select: { city: true, state: true, timeZone: true },
    });
    if (cities.length === 0) {
      return NextResponse.json({ error: 'No cities for the selected states' }, { status: 400 });
    }

    // One task per source per pair: the same city on two directories is two
    // different searches returning different businesses.
    const pairs = sources.flatMap((source) =>
      industries.flatMap((industry) =>
        cities.map((c) => ({
          source,
          industry,
          city: c.city,
          state: c.state.trim(),
          timeZone: c.timeZone,
        })),
      ),
    );

    // Coverage keeps overlapping requests from re-scraping the same territory,
    // but it expires. YellowPages gains businesses continuously, so the same
    // search a few months later returns ones that did not exist the first time.
    // Permanent coverage made the scraper a one-shot tool that ran out of legal
    // work forever once the catalog was covered.
    //
    // Queued work covers regardless of age — a pending task is about to be
    // scraped, and queueing it twice just wastes a search. A completed one
    // covers only until the window closes.
    //
    // 'failed' covers nothing. It exhausted its attempts without ever being
    // scraped, so the pair is genuinely uncovered and should come back around.
    //
    // Coverage is per source. Reading Denver plumbers on YellowPages says
    // nothing about SuperPages, and keying without the source would reject
    // every second-source request against covered territory with the 409 below
    // -- silently, and for the entire catalog.
    const staleAfter = new Date(Date.now() - COVERAGE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const existing = await prisma.scrapeTask.findMany({
      where: {
        industry: { in: industries },
        state: { in: states },
        source: { in: sources },
        OR: [
          { status: { in: ['pending', 'leased'] } },
          { status: 'done', completedAt: { gte: staleAfter } },
        ],
      },
      select: { industry: true, city: true, state: true, source: true },
    });
    const key = (p: { source: string; industry: string; city: string; state: string }) =>
      `${p.source}|${p.industry}|${p.city}|${p.state}`;
    const covered = new Set(
      existing.map((t) => key({ ...t, state: t.state.trim() })),
    );
    const fresh = pairs.filter((p) => !covered.has(key(p)));

    if (preview) {
      // Per source, not three scalars: a pair can be covered on one directory
      // and open on the other, and one blended number describes neither.
      return NextResponse.json({
        totalPairs: pairs.length,
        newPairs: fresh.length,
        alreadyCovered: pairs.length - fresh.length,
        cities: cities.length,
        bySource: sources.map((source) => {
          const total = pairs.filter((p) => p.source === source).length;
          const isNew = fresh.filter((p) => p.source === source).length;
          return { source, totalPairs: total, newPairs: isNew, alreadyCovered: total - isNew };
        }),
      });
    }

    if (fresh.length === 0) {
      return NextResponse.json({ error: 'Every selected pair is already queued or covered' }, { status: 409 });
    }

    const createdBy = await currentUserName();

    // The request and its tasks land together. A committed request with no
    // tasks yet satisfies finish's "nothing pending" test, which would retire
    // it before its work exists, and the UI cannot reopen a done request.
    //
    // Chunked at 250: each row now carries 7 columns, and SQL Server caps a
    // parameterized statement at 2100. At 300 that is exactly 2100 before
    // Prisma's own overhead, which fails only on full-size chunks -- so a small
    // test queue passes and the first real one throws inside the transaction,
    // taking the request down with it.
    const created = await prisma.$transaction(
      async (tx) => {
        const req = await tx.scrapeRequest.create({
          data: { createdBy, createdAt: new Date(), status: 'active', maxPages, priority },
          select: { id: true },
        });
        for (let i = 0; i < fresh.length; i += 250) {
          await tx.scrapeTask.createMany({
            data: fresh.slice(i, i + 250).map((p) => ({ ...p, idRequest: req.id, status: 'pending' })),
          });
        }
        return req;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    return NextResponse.json(
      { id: created.id, queued: fresh.length, alreadyCovered: pairs.length - fresh.length },
      { status: 201 },
    );
  } catch (error) {
    console.error('POST /api/scrape/requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
