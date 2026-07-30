import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/scrape-admin';

const patchSchema = z.object({ status: z.enum(['active', 'paused']) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const id = Number((await params).id);
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!Number.isInteger(id) || !parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const existing = await prisma.scrapeRequest.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.status === 'cancelled' || existing.status === 'done') {
      return NextResponse.json({ error: `Cannot reopen a ${existing.status} request` }, { status: 409 });
    }

    await prisma.scrapeRequest.update({ where: { id }, data: { status: parsed.data.status } });
    return NextResponse.json({ id, status: parsed.data.status });
  } catch (error) {
    console.error('PATCH /api/scrape/requests/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const existing = await prisma.scrapeRequest.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only pending tasks go. Completed ones are the coverage record, and
    // deleting them would let a later request re-scrape the same territory.
    const [removed] = await prisma.$transaction([
      prisma.scrapeTask.deleteMany({ where: { idRequest: id, status: 'pending' } }),
      prisma.scrapeRequest.update({ where: { id }, data: { status: 'cancelled' } }),
    ]);

    return NextResponse.json({ id, status: 'cancelled', tasksRemoved: removed.count });
  } catch (error) {
    console.error('DELETE /api/scrape/requests/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
