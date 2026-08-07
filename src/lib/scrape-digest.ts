/**
 * Aggregation behind the daily scraper digest.
 *
 * The counters on ScrapeRuns answer "how much", and answering "what did it
 * actually do" needs the tasks, which is where industry, city, state and time
 * zone live. Every figure here is a rollup of ScrapeTasks rows already written
 * by the results and fail routes, so nothing new has to be recorded.
 *
 * Kept free of email concerns so the shape can be asserted in tests without a
 * template, and free of request concerns so a future admin view can reuse it.
 */
import { prisma } from '@/lib/prisma';
import { NEW_LEAD_STATUS } from '@/lib/leads';

/** Time zone every report is expressed in. The business runs on Central. */
const REPORT_TIME_ZONE = 'America/Chicago';

/** How many industries and cities the digest names before collapsing the rest. */
const TOP_N = 5;

/**
 * Widest gap around a run that its own calendar day can possibly span. Used to
 * bound the run lookup; 36 hours covers any day plus both DST transitions.
 */
const DAY_WINDOW_MS = 36 * 60 * 60 * 1000;

export type DigestRow = {
  label: string;
  searches: number;
  found: number;
  imported: number;
};

export type DigestCity = {
  city: string;
  state: string;
  imported: number;
};

export type ScrapeDigest = {
  /** Calendar day covered, as YYYY-MM-DD in Central time. */
  dayKey: string;
  runCount: number;
  /** Runs that aborted because their first searches came back empty. */
  driftRuns: number;
  searches: number;
  found: number;
  imported: number;
  duplicates: number;
  blacklisted: number;
  byZone: DigestRow[];
  topIndustries: DigestRow[];
  /** Everything below the top five, collapsed into one row. Null when there is no tail. */
  otherIndustries: (DigestRow & { industries: number }) | null;
  topCities: DigestCity[];
  queuePending: number;
  failedTasks: number;
  readyToCall: number;
};

/**
 * The calendar day a moment falls on in Central time, as YYYY-MM-DD.
 *
 * Intl rather than date arithmetic because Central is the only correct frame
 * for "which day was this" here and it shifts by an hour twice a year; en-CA
 * because its short date format is already ISO order.
 */
export function centralDayKey(moment: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment);
}

/**
 * The day a digest is owed for, or null when none is.
 *
 * A digest is sent by the first run to finish on a new Central day, and it
 * covers the previous run's day. This is what makes one mail per day fall out
 * of the runs themselves: no scheduler, no marker column, and no second place
 * that has to agree about what "today" means.
 *
 * A run with no predecessor sends nothing, so the very first run in a fresh
 * environment does not mail a day that was never scraped.
 */
export function digestDayFor(previousFinishedAt: Date | null, finishedAt: Date): string | null {
  if (!previousFinishedAt) return null;

  const previousDay = centralDayKey(previousFinishedAt);
  return previousDay === centralDayKey(finishedAt) ? null : previousDay;
}

/** Formats a day key for a reader, e.g. 2026-08-06 -> 8/6/2026. */
export function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-');
  return `${Number(month)}/${Number(day)}/${year}`;
}

/**
 * The runs that finished on `dayKey`.
 *
 * Bounded by a window around the anchor and filtered in JS rather than by a
 * UTC range, because deriving the UTC bounds of a Central day means redoing the
 * DST rules that centralDayKey already gets right.
 */
async function runsForDay(dayKey: string, anchor: Date) {
  const candidates = await prisma.scrapeRun.findMany({
    where: {
      status: 'finished',
      finishedAt: {
        gte: new Date(anchor.getTime() - DAY_WINDOW_MS),
        lte: new Date(anchor.getTime() + DAY_WINDOW_MS),
      },
    },
    select: {
      id: true,
      finishedAt: true,
      finishReason: true,
      leadsFound: true,
      leadsImported: true,
      duplicates: true,
      blacklisted: true,
      tasksDone: true,
    },
  });

  return candidates.filter((run) => run.finishedAt && centralDayKey(run.finishedAt) === dayKey);
}

function toRow(label: string, sums: { searches: number; found: number; imported: number }): DigestRow {
  return { label, searches: sums.searches, found: sums.found, imported: sums.imported };
}

/**
 * Everything the digest email needs for one day.
 *
 * `anchor` is any moment on that day — in practice the finish time of the last
 * run of it — and only bounds the lookup.
 */
export async function collectDigest(dayKey: string, anchor: Date): Promise<ScrapeDigest> {
  const runs = await runsForDay(dayKey, anchor);
  const runIds = runs.map((run) => run.id);

  const totals = runs.reduce(
    (acc, run) => ({
      searches: acc.searches + run.tasksDone,
      found: acc.found + run.leadsFound,
      imported: acc.imported + run.leadsImported,
      duplicates: acc.duplicates + run.duplicates,
      blacklisted: acc.blacklisted + run.blacklisted,
    }),
    { searches: 0, found: 0, imported: 0, duplicates: 0, blacklisted: 0 },
  );

  // A day with no runs still mails: it says so, rather than reporting an
  // aggregate over an empty set as though the scraper had worked.
  if (runIds.length === 0) {
    return {
      dayKey,
      runCount: 0,
      driftRuns: 0,
      ...totals,
      byZone: [],
      topIndustries: [],
      otherIndustries: null,
      topCities: [],
      queuePending: await prisma.scrapeTask.count({ where: { status: 'pending' } }),
      failedTasks: 0,
      readyToCall: await prisma.business.count({ where: { idStatus: NEW_LEAD_STATUS } }),
    };
  }

  const scope = { idRun: { in: runIds }, status: 'done' } as const;

  const [byZoneRaw, byIndustryRaw, byCityRaw, queuePending, failedTasks, readyToCall] =
    await Promise.all([
      prisma.scrapeTask.groupBy({
        by: ['timeZone'],
        where: scope,
        _sum: { foundCount: true, importedCount: true },
        _count: { _all: true },
      }),
      prisma.scrapeTask.groupBy({
        by: ['industry'],
        where: scope,
        _sum: { foundCount: true, importedCount: true },
        _count: { _all: true },
      }),
      prisma.scrapeTask.groupBy({
        by: ['city', 'state'],
        where: scope,
        _sum: { importedCount: true },
        orderBy: { _sum: { importedCount: 'desc' } },
        take: TOP_N,
      }),
      prisma.scrapeTask.count({ where: { status: 'pending' } }),
      prisma.scrapeTask.count({ where: { idRun: { in: runIds }, status: 'failed' } }),
      prisma.business.count({ where: { idStatus: NEW_LEAD_STATUS } }),
    ]);

  const zoneRows = byZoneRaw
    .map((row) =>
      toRow(row.timeZone, {
        searches: row._count._all,
        found: row._sum.foundCount ?? 0,
        imported: row._sum.importedCount ?? 0,
      }),
    )
    .sort((a, b) => b.imported - a.imported);

  const industryRows = byIndustryRaw
    .map((row) =>
      toRow(row.industry, {
        searches: row._count._all,
        found: row._sum.foundCount ?? 0,
        imported: row._sum.importedCount ?? 0,
      }),
    )
    .sort((a, b) => b.imported - a.imported || b.found - a.found);

  const topIndustries = industryRows.slice(0, TOP_N);
  const tail = industryRows.slice(TOP_N);

  return {
    dayKey,
    runCount: runs.length,
    driftRuns: runs.filter((run) => run.finishReason === 'drift').length,
    ...totals,
    byZone: zoneRows,
    topIndustries,
    otherIndustries: tail.length
      ? {
          label: `${tail.length} more ${tail.length === 1 ? 'industry' : 'industries'}`,
          industries: tail.length,
          searches: tail.reduce((sum, row) => sum + row.searches, 0),
          found: tail.reduce((sum, row) => sum + row.found, 0),
          imported: tail.reduce((sum, row) => sum + row.imported, 0),
        }
      : null,
    topCities: byCityRaw.map((row) => ({
      city: row.city,
      state: row.state,
      imported: row._sum.importedCount ?? 0,
    })),
    queuePending,
    failedTasks,
    readyToCall,
  };
}
