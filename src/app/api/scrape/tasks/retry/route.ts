import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/scrape-admin';

const bodySchema = z.object({ taskIds: z.array(z.number().int().positive()).min(1).max(500) });

/**
 * Returns failed tasks to the queue.
 *
 * Coverage is permanent and the unique index means a failed pair cannot be
 * re-queued by creating a new request. Without this route a transient proxy
 * outage retires that industry and city for good.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const requeued = await prisma.scrapeTask.updateMany({
      where: { id: { in: parsed.data.taskIds }, status: 'failed' },
      data: { status: 'pending', attempts: 0, lastError: null, leasedAt: null },
    });

    return NextResponse.json({ requeued: requeued.count });
  } catch (error) {
    console.error('POST /api/scrape/tasks/retry error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
