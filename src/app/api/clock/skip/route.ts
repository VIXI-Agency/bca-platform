import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nowPstAsUtc, getTodayRangePST } from '@/lib/time';
import { BREAK_PUNCHES, breakOrderFor, nextClockAction } from '@/lib/clock/break-order';
import { z } from 'zod';

const skipBreakSchema = z.object({
  breakType: z.enum(['firstBreak', 'lunch', 'secondBreak']),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;

    // The session outlives a deactivation, so check the account is still
    // active, and read which breaks this employee takes and in what order.
    const user = await prisma.user.findUnique({
      where: { idUser: userId },
      select: { isPartTime: true, status: true, breakOrder: true },
    });
    if (!user || user.status === true) {
      return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = skipBreakSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid break type', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { breakType } = parsed.data;

    // Only lunch can be skipped. Breaks are always taken — part-timers
    // included, now that their one break replaces lunch.
    if (breakType !== 'lunch') {
      return NextResponse.json({ error: 'Breaks cannot be skipped.' }, { status: 403 });
    }
    const fields = BREAK_PUNCHES[breakType];
    const now = nowPstAsUtc();
    const { todayStart, todayEnd } = getTodayRangePST();

    // Find today's time log
    const log = await prisma.employeeTimeLog.findFirst({
      where: {
        idUser: userId,
        logDate: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    if (!log || !log.clockIn) {
      return NextResponse.json({ error: 'Must clock in first' }, { status: 400 });
    }

    if (log.clockOut) {
      return NextResponse.json({ error: 'Already clocked out for the day' }, { status: 400 });
    }

    // Lunch can only be skipped when it's this employee's next step (after a
    // first break normally; right after clock-in for a lunch-first order).
    const next = nextClockAction(log, breakOrderFor(user.breakOrder, user.isPartTime === true));
    if (next !== fields.out) {
      return NextResponse.json(
        { error: `Cannot skip ${breakType} now. Next step: ${next}.` },
        { status: 400 }
      );
    }

    // Set both out and in to current time (0-duration break)
    const updated = await prisma.employeeTimeLog.update({
      where: { timeLogId: log.timeLogId },
      data: {
        [fields.out]: now,
        [fields.in]: now,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Clock skip error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
