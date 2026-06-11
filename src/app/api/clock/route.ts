import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTodayRangePST } from '@/lib/time';
import type { ClockStatus } from '@/types';

function getStatus(log: {
  clockIn: Date | null;
  firstBreakOut: Date | null;
  firstBreakIn: Date | null;
  lunchOut: Date | null;
  lunchIn: Date | null;
  secondBreakOut: Date | null;
  secondBreakIn: Date | null;
  clockOut: Date | null;
} | null): ClockStatus {
  if (!log || !log.clockIn) return 'not_clocked_in';
  if (log.clockOut) return 'clocked_out';
  if (log.secondBreakOut && !log.secondBreakIn) return 'second_break';
  if (log.lunchOut && !log.lunchIn) return 'lunch';
  if (log.firstBreakOut && !log.firstBreakIn) return 'first_break';
  return 'working';
}

function getNextAction(log: {
  clockIn: Date | null;
  firstBreakOut: Date | null;
  firstBreakIn: Date | null;
  lunchOut: Date | null;
  lunchIn: Date | null;
  secondBreakOut: Date | null;
  secondBreakIn: Date | null;
  clockOut: Date | null;
} | null): string | null {
  if (!log || !log.clockIn) return 'clockIn';
  if (log.clockOut) return null;
  if (!log.firstBreakOut) return 'firstBreakOut';
  if (!log.firstBreakIn) return 'firstBreakIn';
  if (!log.lunchOut) return 'lunchOut';
  if (!log.lunchIn) return 'lunchIn';
  if (!log.secondBreakOut) return 'secondBreakOut';
  if (!log.secondBreakIn) return 'secondBreakIn';
  return 'clockOut';
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;
    const { todayStart, todayEnd } = getTodayRangePST();

    // Whether this employee is part-time controls who may skip breaks
    // (lunch can be skipped by anyone — see /api/clock/skip).
    const dbUser = await prisma.user.findUnique({
      where: { idUser: userId },
      select: { isPartTime: true },
    });
    const isPartTime = dbUser?.isPartTime ?? false;

    const log = await prisma.employeeTimeLog.findFirst({
      where: {
        idUser: userId,
        logDate: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    if (!log) {
      return NextResponse.json({
        data: null,
        status: 'not_clocked_in' as ClockStatus,
        nextAction: 'clockIn',
        isPartTime,
      });
    }

    return NextResponse.json({
      isPartTime,
      data: {
        clockIn: log.clockIn?.toISOString() ?? null,
        firstBreakOut: log.firstBreakOut?.toISOString() ?? null,
        firstBreakIn: log.firstBreakIn?.toISOString() ?? null,
        lunchOut: log.lunchOut?.toISOString() ?? null,
        lunchIn: log.lunchIn?.toISOString() ?? null,
        secondBreakOut: log.secondBreakOut?.toISOString() ?? null,
        secondBreakIn: log.secondBreakIn?.toISOString() ?? null,
        clockOut: log.clockOut?.toISOString() ?? null,
        totalHours: log.totalHours,
      },
      status: getStatus(log),
      nextAction: getNextAction(log),
    });
  } catch (error) {
    console.error('Clock GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
