import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireWorkerAuth } from '@/lib/scrape-auth';

const LEASE_MINUTES = 30;
const MAX_ATTEMPTS = 3;

const bodySchema = z.object({
  limit: z.number().int().min(1).max(200).default(25),
  runId: z.number().int().positive().optional(),
});

type LeasedRow = {
  Id: number;
  IdRequest: number;
  Industry: string;
  City: string;
  State: string;
  TimeZone: string;
};

export async function POST(request: NextRequest) {
  const denied = requireWorkerAuth(request);
  if (denied) return denied;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { limit } = parsed.data;
    const now = new Date();

    // Reclaim abandoned leases. Attempts increments here too, otherwise a task
    // that reliably kills the worker is leased, abandoned and reclaimed forever
    // without ever reaching 'failed'.
    const cutoff = new Date(now.getTime() - LEASE_MINUTES * 60_000);
    await prisma.$executeRaw`
      UPDATE dbo.ScrapeTasks
      SET Status    = CASE WHEN Attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
          Attempts  = Attempts + 1,
          LeasedAt  = NULL,
          LastError = CASE WHEN Attempts + 1 >= ${MAX_ATTEMPTS}
                           THEN 'Lease expired without a result' ELSE LastError END
      WHERE Status = 'leased' AND LeasedAt < ${cutoff}`;

    const runId = await resolveRun(parsed.data.runId, now);
    if (runId === null) {
      return NextResponse.json({ error: 'Run already finished' }, { status: 409 });
    }

    // One statement, not SELECT-then-UPDATE. Under READ COMMITTED the shared
    // locks of a SELECT are released as each row is read, so two callers can
    // pick the same rows; with READ_COMMITTED_SNAPSHOT they never block at all
    // and double-leasing is certain. UPDLOCK takes the update lock up front and
    // READPAST skips rows another caller already holds instead of deadlocking.
    const leased = await prisma.$queryRaw<LeasedRow[]>`
      UPDATE t
      SET Status = 'leased', LeasedAt = ${now}, IdRun = ${runId}
      OUTPUT inserted.Id, inserted.IdRequest, inserted.Industry, inserted.City,
             inserted.State, inserted.TimeZone
      FROM (
        SELECT TOP (${limit}) tk.*
        FROM dbo.ScrapeTasks tk WITH (ROWLOCK, UPDLOCK, READPAST)
        JOIN dbo.ScrapeRequests r ON r.Id = tk.IdRequest
        WHERE tk.Status = 'pending' AND r.Status = 'active'
        ORDER BY r.CreatedAt, tk.Id
      ) t`;

    const maxPagesByRequest = await loadMaxPages(leased.map((t) => t.IdRequest));

    // READPAST means an empty batch can coexist with a full queue, so the
    // worker must not read tasks.length === 0 as "nothing left to scrape".
    const pendingRemaining = await countPending();

    return NextResponse.json({
      runId,
      pendingRemaining,
      tasks: leased.map((t) => ({
        taskId: t.Id,
        industry: t.Industry,
        city: t.City,
        state: t.State.trim(),
        timeZone: t.TimeZone,
        maxPages: maxPagesByRequest.get(t.IdRequest) ?? 3,
      })),
    });
  } catch (error) {
    console.error('POST /api/scrape/worker/lease error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Returns the run to append to, or null when the caller named a finished one. */
async function resolveRun(runId: number | undefined, now: Date): Promise<number | null> {
  if (runId === undefined) {
    const run = await prisma.scrapeRun.create({
      data: { startedAt: now, status: 'running' },
      select: { id: true },
    });
    return run.id;
  }
  const existing = await prisma.scrapeRun.findUnique({ where: { id: runId }, select: { status: true } });
  return existing?.status === 'running' ? runId : null;
}

async function loadMaxPages(requestIds: number[]): Promise<Map<number, number>> {
  if (requestIds.length === 0) return new Map();
  const requests = await prisma.scrapeRequest.findMany({
    where: { id: { in: [...new Set(requestIds)] } },
    select: { id: true, maxPages: true },
  });
  return new Map(requests.map((r) => [r.id, r.maxPages]));
}

async function countPending(): Promise<number> {
  return prisma.scrapeTask.count({
    where: { status: 'pending', request: { status: 'active' } },
  });
}
