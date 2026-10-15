import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { getPayPeriodEnd, resolvePayPeriodStart } from '@/lib/time';
import { DISCONNECTION_TYPES } from '@/lib/admin-time/disconnections';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId: userIdStr } = await params;
    const targetUserId = parseInt(userIdStr, 10);
    if (isNaN(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = clockWeekSchema.safeParse({ week: searchParams.get('week') || undefined });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid week parameter', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const periodStart = resolvePayPeriodStart(parsed.data.week);
    const periodEnd = getPayPeriodEnd(periodStart);

    const disconnections = await prisma.employeeDisconnection.findMany({
      where: {
        idUser: targetUserId,
        disconnectionDate: { gte: periodStart, lt: periodEnd },
        removedAt: null,
      },
      orderBy: [{ disconnectionDate: 'asc' }, { disconnectionTime: 'asc' }],
    });

    const counts: Record<string, number> = Object.fromEntries(
      DISCONNECTION_TYPES.map((t) => [t, 0]),
    );
    for (const d of disconnections) {
      const type = d.disconnectionType && DISCONNECTION_TYPES.includes(d.disconnectionType as (typeof DISCONNECTION_TYPES)[number])
        ? d.disconnectionType
        : 'other';
      counts[type] = (counts[type] ?? 0) + 1;
    }

    const data = disconnections.map((d) => {
      let durationMinutes: number | null = null;
      if (d.reconnectionTime) {
        let ms = d.reconnectionTime.getTime() - d.disconnectionTime.getTime();
        if (ms < 0) ms += 24 * 60 * 60 * 1000;
        durationMinutes = Math.round(ms / 60000);
      }
      return {
        id: d.idDisconnection,
        date: d.disconnectionDate.toISOString().split('T')[0],
        type: d.disconnectionType ?? 'other',
        reason: d.reason ?? '',
        disconnectedBy: d.disconnectedBy ?? '',
        // PST wall-clock TIME values as ISO strings, same as the clock punches.
        startTime: d.disconnectionTime.toISOString(),
        endTime: d.reconnectionTime?.toISOString() ?? null,
        durationMinutes,
      };
    });

    return NextResponse.json({ data, counts });
  } catch (error) {
    console.error('Admin time disconnections GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
