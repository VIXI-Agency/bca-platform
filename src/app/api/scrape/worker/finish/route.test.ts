import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const sendEmail = vi.fn(async () => true);
const collectDigest = vi.fn();
const findUnique = vi.fn();
const findFirst = vi.fn();
const update = vi.fn(async () => ({}));
const updateMany = vi.fn(async () => ({ count: 0 }));

vi.mock('@/lib/scrape-auth', () => ({ requireWorkerAuth: () => null }));
vi.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...(args as [])),
  buildScrapeDigestEmailHTML: () => '<html></html>',
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    scrapeRun: {
      findUnique: (...a: unknown[]) => findUnique(...(a as [])),
      findFirst: (...a: unknown[]) => findFirst(...(a as [])),
      update: (...a: unknown[]) => update(...(a as [])),
    },
    scrapeRequest: { updateMany: (...a: unknown[]) => updateMany(...(a as [])) },
  },
}));
// The day-boundary functions stay real: they are the logic under test here.
vi.mock('@/lib/scrape-digest', async () => ({
  ...(await vi.importActual<typeof import('@/lib/scrape-digest')>('@/lib/scrape-digest')),
  collectDigest: (...a: unknown[]) => collectDigest(...(a as [])),
}));

const { POST } = await import('./route');
const { centralDayKey } = await import('@/lib/scrape-digest');

const DAY_MS = 24 * 60 * 60 * 1000;
const dryRun = process.env.SCRAPE_DRY_RUN;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SCRAPE_DRY_RUN;
  findUnique.mockResolvedValue({ id: 44, status: 'running' });
  collectDigest.mockResolvedValue({
    dayKey: '2026-08-06',
    runCount: 4,
    driftRuns: 1,
    searches: 1294,
    found: 43691,
    imported: 407,
    duplicates: 41033,
    blacklisted: 2251,
    byZone: [],
    topIndustries: [],
    otherIndustries: null,
    topCities: [],
    queuePending: 2118,
    failedTasks: 18,
    readyToCall: 1169820,
  });
});

afterEach(() => {
  if (dryRun === undefined) delete process.env.SCRAPE_DRY_RUN;
  else process.env.SCRAPE_DRY_RUN = dryRun;
});

function finishRequest(reason = 'budget'): NextRequest {
  return new NextRequest('https://example.com/api/scrape/worker/finish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId: 44, reason }),
  });
}

/** A moment guaranteed to fall on an earlier Central day than right now. */
function yesterday(): Date {
  return new Date(Date.now() - DAY_MS - 2 * 60 * 60 * 1000);
}

describe('POST /api/scrape/worker/finish', () => {
  it('mails nothing when the previous run finished on the same day', async () => {
    findFirst.mockResolvedValue({ finishedAt: new Date() });

    const response = await POST(finishRequest());

    expect(await response.json()).toMatchObject({ digestDay: null, digestSent: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('mails one report when the run crosses into a new day', async () => {
    const previous = yesterday();
    findFirst.mockResolvedValue({ finishedAt: previous });

    const response = await POST(finishRequest());

    expect(await response.json()).toMatchObject({
      digestDay: centralDayKey(previous),
      digestSent: true,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(collectDigest).toHaveBeenCalledWith(centralDayKey(previous), previous);
  });

  it('reports the day that was scraped, not the day the mail goes out', async () => {
    const previous = yesterday();
    findFirst.mockResolvedValue({ finishedAt: previous });

    await POST(finishRequest());

    const [{ subject, to }] = sendEmail.mock.calls[0] as unknown as [
      { subject: string; to: Array<{ email: string }> },
    ];
    const [year, month, day] = centralDayKey(previous).split('-');
    expect(subject).toContain(`${Number(month)}/${Number(day)}/${year}`);
    expect(subject).toContain('407 new leads');
    expect(to).toHaveLength(3);
  });

  it('mails nothing on the very first run of a fresh environment', async () => {
    findFirst.mockResolvedValue(null);

    const response = await POST(finishRequest());

    expect(await response.json()).toMatchObject({ digestDay: null, digestSent: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('still records a drift run and never mails an alert for it', async () => {
    findFirst.mockResolvedValue({ finishedAt: new Date() });

    await POST(finishRequest('drift'));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 44 },
        data: expect.objectContaining({ status: 'finished', finishReason: 'drift' }),
      }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing under SCRAPE_DRY_RUN', async () => {
    process.env.SCRAPE_DRY_RUN = '1';
    findFirst.mockResolvedValue({ finishedAt: yesterday() });

    const response = await POST(finishRequest());

    expect(await response.json()).toMatchObject({ digestSent: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(collectDigest).not.toHaveBeenCalled();
  });

  it('does not re-finish a run that already closed', async () => {
    findUnique.mockResolvedValue({ id: 44, status: 'finished' });

    const response = await POST(finishRequest());

    expect(await response.json()).toMatchObject({ alreadyRecorded: true });
    expect(update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
