import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { getTodayRangePST, getPayPeriodStart } from '@/lib/time';
import { DISCONNECTION_TYPES } from '../../disconnect/route';

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
    if (role !== 1 && role !== 2) {
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

    let periodStart: Date;
    if (parsed.data.week) {
      const parts = parsed.data.week.split('-').map(Number);
      const inputDate = new Date(parts[0], parts[1] - 1, parts[2]);
      periodStart = getPayPeriodStart(inputDate);
    } else {
      const { todayStart } = getTodayRangePST();
      periodStart = getPayPeriodStart(todayStart);
    }

    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 7);

    const disconnections = await prisma.employeeDisconnection.findMany({
      where: {
        idUser: targetUserId,
        disconnectionDate: { gte: periodStart, lt: periodEnd },
      },
      orderBy: { disconnectionDate: 'asc' },
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

    const data = disconnections.map((d) => ({
      id: d.idDisconnection,
      date: d.disconnectionDate.toISOString().split('T')[0],
      type: d.disconnectionType ?? 'other',
      reason: d.reason ?? '',
      disconnectedBy: d.disconnectedBy ?? '',
    }));

    return NextResponse.json({ data, counts });
  } catch (error) {
    console.error('Admin time disconnections GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
