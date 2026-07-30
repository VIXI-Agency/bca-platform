import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireWorkerAuth } from '@/lib/scrape-auth';

const MAX_ATTEMPTS = 3;

const bodySchema = z.object({
  runId: z.number().int().positive(),
  taskId: z.number().int().positive(),
  error: z.string().max(500).default('Unknown worker error'),
});

/**
 * Reports a task the worker could not fetch at all.
 *
 * Without this route the only way to close a task is `results`, and posting an
 * empty listing array there marks it done: a run where every proxy was blocked
 * would be recorded permanently as "these cities have no businesses".
 */
export async function POST(request: NextRequest) {
  const denied = requireWorkerAuth(request);
  if (denied) return denied;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { runId, taskId, error } = parsed.data;

    const task = await prisma.scrapeTask.findUnique({
      where: { id: taskId },
      select: { status: true, attempts: true },
    });
    if (!task) {
      return NextResponse.json({ error: 'Unknown task' }, { status: 404 });
    }
    if (task.status === 'done') {
      return NextResponse.json({ status: 'done', attempts: task.attempts, alreadyRecorded: true });
    }

    const attempts = task.attempts + 1;
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

    await prisma.scrapeTask.update({
      where: { id: taskId },
      data: { status, attempts, lastError: error.slice(0, 500), leasedAt: null, idRun: runId },
    });

    return NextResponse.json({ status, attempts });
  } catch (err) {
    console.error('POST /api/scrape/worker/fail error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
