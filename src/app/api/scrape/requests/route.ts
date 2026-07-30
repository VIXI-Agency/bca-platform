import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, currentUserName } from '@/lib/scrape-admin';

const createSchema = z.object({
  industries: z.array(z.string().min(1)).min(1).max(200),
  states: z.array(z.string().length(2)).min(1).max(60),
  maxPages: z.number().int().min(1).max(10).default(3),
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
    const { industries, states, maxPages, preview } = parsed.data;

    const cities = await prisma.scrapeCity.findMany({
      where: { state: { in: states } },
      select: { city: true, state: true, timeZone: true },
    });
    if (cities.length === 0) {
      return NextResponse.json({ error: 'No cities for the selected states' }, { status: 400 });
    }

    const pairs = industries.flatMap((industry) =>
      cities.map((c) => ({ industry, city: c.city, state: c.state.trim(), timeZone: c.timeZone })),
    );

    // Coverage is global: a pair already queued by an earlier request is not
    // queued again, which is what stops overlapping requests from re-scraping
    // the same territory.
    //
    // 'failed' is deliberately not covered. A task that exhausted its attempts
    // was never scraped, and treating it as covered would retire that pair for
    // good on a transient proxy outage. The unique index still prevents a
    // second row, so those pairs are requeued through the failed-task view.
    const existing = await prisma.scrapeTask.findMany({
      where: {
        industry: { in: industries },
        state: { in: states },
        status: { in: ['pending', 'leased', 'done'] },
      },
      select: { industry: true, city: true, state: true },
    });
    const covered = new Set(existing.map((t) => `${t.industry}|${t.city}|${t.state.trim()}`));
    const fresh = pairs.filter((p) => !covered.has(`${p.industry}|${p.city}|${p.state}`));

    if (preview) {
      return NextResponse.json({
        totalPairs: pairs.length,
        newPairs: fresh.length,
        alreadyCovered: pairs.length - fresh.length,
        cities: cities.length,
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
    // Chunked at 300: each row carries 6 columns, and SQL Server caps a
    // parameterized statement at 2100.
    const created = await prisma.$transaction(
      async (tx) => {
        const req = await tx.scrapeRequest.create({
          data: { createdBy, createdAt: new Date(), status: 'active', maxPages },
          select: { id: true },
        });
        for (let i = 0; i < fresh.length; i += 300) {
          await tx.scrapeTask.createMany({
            data: fresh.slice(i, i + 300).map((p) => ({ ...p, idRequest: req.id, status: 'pending' })),
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
