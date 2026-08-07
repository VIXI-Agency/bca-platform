import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireWorkerAuth } from '@/lib/scrape-auth';
import { buildScrapeDigestEmailHTML, sendEmail } from '@/lib/email';
import { collectDigest, digestDayFor, formatDayKey, type ScrapeDigest } from '@/lib/scrape-digest';

const bodySchema = z.object({
  runId: z.number().int().positive(),
  reason: z.enum(['empty', 'target', 'budget', 'drift']),
});

const SUMMARY_RECIPIENTS = [
  { email: 'support@benjaminchaise.com', name: 'BenjaminChaise Support' },
  { email: 'brianna@benjaminchaise.com', name: 'Brianna' },
  { email: 'michael@benjaminchaise.com', name: 'Michael' },
];

const DEFAULT_APP_URL = 'https://yourdebtcollectors.com';

export async function POST(request: NextRequest) {
  const denied = requireWorkerAuth(request);
  if (denied) return denied;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { runId, reason } = parsed.data;

    const run = await prisma.scrapeRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: 'Unknown run' }, { status: 404 });
    }
    if (run.status !== 'running') {
      return NextResponse.json({ alreadyRecorded: true, digestSent: false });
    }

    // Read before this run joins the finished set, so it cannot be its own
    // predecessor and every run compares against the one that came before it.
    const previous = await prisma.scrapeRun.findFirst({
      where: { status: 'finished', finishedAt: { not: null }, id: { not: runId } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });

    const finishedAt = new Date();
    await prisma.scrapeRun.update({
      where: { id: runId },
      data: { finishedAt, status: 'finished', finishReason: reason },
    });

    // A request with zero tasks satisfies `none`, so a request created moments
    // ago whose tasks are still being inserted would be retired here and can
    // never be reopened. Requiring at least one task closes that window.
    const completed = await prisma.scrapeRequest.updateMany({
      where: {
        status: 'active',
        tasks: { some: {} },
        NOT: { tasks: { some: { status: { in: ['pending', 'leased'] } } } },
      },
      data: { status: 'done' },
    });

    if (reason === 'drift') {
      console.warn(
        `Scrape run ${runId} aborted on drift at ${finishedAt.toISOString()}: its first tasks all returned ` +
          'zero listings, so the queue was left untouched. The daily report counts these; several days of ' +
          'them means YellowPages changed its markup, so check the XPath selectors in scraper_core.py.',
      );
    }

    const previousFinishedAt = previous?.finishedAt ?? null;
    const digestDay = digestDayFor(previousFinishedAt, finishedAt);

    // Reporting failures must not fail the call. The run is already closed and
    // the queue already released by this point; answering 500 over an unsent
    // mail would tell the worker its run did not land and invite a retry that
    // can only be a no-op.
    let digestSent = false;
    if (digestDay && previousFinishedAt) {
      try {
        digestSent = await sendDigest(digestDay, previousFinishedAt);
      } catch (mailError) {
        console.error(`Failed to send the ${digestDay} scraper report:`, mailError);
      }
    }

    return NextResponse.json({ requestsCompleted: completed.count, digestDay, digestSent });
  } catch (error) {
    console.error('POST /api/scrape/worker/finish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function subjectFor(digest: ScrapeDigest, reportDate: string): string {
  if (digest.runCount === 0) return `Scraper report ${reportDate}: no runs`;
  if (digest.queuePending === 0) return `Scraper report ${reportDate}: queue is empty`;
  return `Scraper report ${reportDate}: ${digest.imported.toLocaleString('en-US')} new leads`;
}

/**
 * Mails one report covering a whole day of runs.
 *
 * Called by the first run to finish on a new day, which is what keeps this to
 * one mail per day without a scheduler: the worker already runs several times
 * daily and each run knows when the previous one finished, so the day boundary
 * is observable from the runs themselves. Nothing else has to stay in sync
 * with a cron entry, and a day with no runs at all still gets reported by the
 * next run that does finish.
 */
async function sendDigest(dayKey: string, anchor: Date): Promise<boolean> {
  // Recipients are three real people and this database is shared by QA and
  // production, so any test run against it would mail them. The guard is what
  // makes the endpoint exercisable at all.
  if (process.env.SCRAPE_DRY_RUN === '1') {
    console.warn(`SCRAPE_DRY_RUN set, skipping the ${dayKey} scraper report`);
    return false;
  }

  const digest = await collectDigest(dayKey, anchor);
  const reportDate = formatDayKey(dayKey);
  const appUrl = (process.env.AUTH_URL || DEFAULT_APP_URL).replace(/\/+$/, '');

  return sendEmail({
    to: SUMMARY_RECIPIENTS,
    subject: subjectFor(digest, reportDate),
    html: buildScrapeDigestEmailHTML({
      reportDate,
      runCount: digest.runCount,
      driftRuns: digest.driftRuns,
      searches: digest.searches,
      found: digest.found,
      imported: digest.imported,
      duplicates: digest.duplicates,
      blacklisted: digest.blacklisted,
      byZone: digest.byZone,
      topIndustries: digest.topIndustries,
      otherIndustries: digest.otherIndustries,
      topCities: digest.topCities,
      queuePending: digest.queuePending,
      failedTasks: digest.failedTasks,
      readyToCall: digest.readyToCall,
      findLeadsUrl: `${appUrl}/admin/find-leads`,
    }),
  });
}
