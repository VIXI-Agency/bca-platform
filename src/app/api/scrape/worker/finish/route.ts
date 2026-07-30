import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireWorkerAuth } from '@/lib/scrape-auth';
import { NEW_LEAD_STATUS } from '@/lib/leads';
import { buildScrapeSummaryEmailHTML, buildScrapeAlertEmailHTML, sendEmail } from '@/lib/email';

const bodySchema = z.object({
  runId: z.number().int().positive(),
  reason: z.enum(['empty', 'target', 'budget', 'drift']),
});

const SUMMARY_RECIPIENTS = [
  { email: 'support@benjaminchaise.com', name: 'BenjaminChaise Support' },
  { email: 'brianna@benjaminchaise.com', name: 'Brianna' },
  { email: 'michael@benjaminchaise.com', name: 'Michael' },
];

function formatReportDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

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
      return NextResponse.json({ alreadyRecorded: true, emailSent: false });
    }

    const finishedAt = new Date();
    await prisma.scrapeRun.update({
      where: { id: runId },
      data: { finishedAt, status: 'finished', finishReason: reason },
    });

    const completed = await prisma.scrapeRequest.updateMany({
      where: { status: 'active', tasks: { none: { status: { in: ['pending', 'leased'] } } } },
      data: { status: 'done' },
    });

    const emailSent = await sendRunEmail(runId, reason, finishedAt, run);

    return NextResponse.json({ requestsCompleted: completed.count, emailSent });
  } catch (error) {
    console.error('POST /api/scrape/worker/finish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

type RunCounters = {
  tasksDone: number;
  leadsFound: number;
  leadsImported: number;
  duplicates: number;
  blacklisted: number;
};

/**
 * The reason decides who hears about the run and how.
 *
 * A drained queue and a healthy run look identical in the summary template, and
 * recipients who get an all-zeros report every morning stop reading it, which is
 * also how a drift alert goes unnoticed.
 */
async function sendRunEmail(
  runId: number,
  reason: string,
  finishedAt: Date,
  counters: RunCounters,
): Promise<boolean> {
  // Recipients are three real people and this database is shared by QA and
  // production, so any test run against it would mail them. The guard is what
  // makes the endpoint exercisable at all.
  if (process.env.SCRAPE_DRY_RUN === '1') {
    console.warn(`SCRAPE_DRY_RUN set, skipping ${reason} email for run ${runId}`);
    return false;
  }

  if (reason === 'drift') {
    const to = process.env.SCRAPE_ALERT_EMAIL ?? SUMMARY_RECIPIENTS[0].email;
    return sendEmail({
      to: [{ email: to, name: 'Scraper alert' }],
      subject: 'Scraper aborted: no listings found',
      html: buildScrapeAlertEmailHTML({
        runId,
        reportDate: formatReportDate(finishedAt),
        message:
          'The first tasks of this run all returned zero listings, so the run was aborted before consuming more of the queue. YellowPages most likely changed its markup; check the XPath selectors in scraper_core.py.',
      }),
    });
  }

  const readyToCall = await prisma.business.count({ where: { idStatus: NEW_LEAD_STATUS } });

  return sendEmail({
    to: SUMMARY_RECIPIENTS,
    subject: reason === 'empty' ? 'Scraper queue is empty' : 'New Leads Imported!',
    html: buildScrapeSummaryEmailHTML({
      runId,
      reportDate: formatReportDate(finishedAt),
      queueDrained: reason === 'empty',
      searchesRun: counters.tasksDone,
      totalRecords: counters.leadsFound,
      duplicatesFound: counters.duplicates,
      blackListBusinesses: counters.blacklisted,
      businessesImported: counters.leadsImported,
      businessesReadyToCall: readyToCall,
    }),
  });
}
