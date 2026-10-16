import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTodayRangePST } from '@/lib/time';
import { computeDayMetrics, disconnectionKey, fetchDisconnectionWindows } from '@/lib/payroll/compute';
import { breakOrderFor, nextClockAction } from '@/lib/clock/break-order';
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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;
    const { todayStart, todayEnd } = getTodayRangePST();

    // Which breaks this employee takes, in order (part-timers: one break, no
    // lunch; Janice: lunch first). Drives the next step and the page's timeline.
    const dbUser = await prisma.user.findUnique({
      where: { idUser: userId },
      select: { isPartTime: true, breakOrder: true },
    });
    const isPartTime = dbUser?.isPartTime ?? false;
    const breakOrder = breakOrderFor(dbUser?.breakOrder, isPartTime);

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
        breakOrder,
      });
    }

    // The TotalHours column is legacy and nothing writes it; compute today's
    // paid hours (lunch and disconnections deducted, OT included) instead.
    let totalHours: number | null = null;
    if (log.clockIn && log.clockOut) {
      const disconnections = await fetchDisconnectionWindows(todayStart, todayEnd, userId);
      const metrics = computeDayMetrics(log, disconnections.get(disconnectionKey(userId, log.logDate)));
      totalHours = Math.round((metrics.totalHours + metrics.overtime) * 100) / 100;
    }

    return NextResponse.json({
      isPartTime,
      breakOrder,
      data: {
        clockIn: log.clockIn?.toISOString() ?? null,
        firstBreakOut: log.firstBreakOut?.toISOString() ?? null,
        firstBreakIn: log.firstBreakIn?.toISOString() ?? null,
        lunchOut: log.lunchOut?.toISOString() ?? null,
        lunchIn: log.lunchIn?.toISOString() ?? null,
        secondBreakOut: log.secondBreakOut?.toISOString() ?? null,
        secondBreakIn: log.secondBreakIn?.toISOString() ?? null,
        clockOut: log.clockOut?.toISOString() ?? null,
        totalHours,
      },
      status: getStatus(log),
      nextAction: nextClockAction(log, breakOrder),
    });
  } catch (error) {
    console.error('Clock GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
