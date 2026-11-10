import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockActionSchema } from '@/lib/validators';
import { nowPstAsUtc, getTodayRangePST, minutesSinceStored } from '@/lib/time';
import { breakOrderFor, punchOrder } from '@/lib/clock/break-order';
import { clockInStartFor, recordedClockIn } from '@/lib/clock/clock-in-start';
import type { ClockAction } from '@/types';

type PunchRules = {
  /** The punches this employee makes, in order. */
  order: ClockAction[];
  /** Shift start, minutes after midnight Pacific. */
  clockInStart: number;
};

/** The account's punch rules, or null when it can't record time (deactivated). */
async function activePunchRules(userId: number): Promise<PunchRules | null> {
  const account = await prisma.user.findUnique({
    where: { idUser: userId },
    select: { status: true, isPartTime: true, breakOrder: true, clockInStartMinutes: true },
  });
  if (!account || account.status === true) return null;
  return {
    order: punchOrder(breakOrderFor(account.breakOrder, account.isPartTime === true)),
    clockInStart: clockInStartFor(account.clockInStartMinutes),
  };
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;
    const role = (session.user as { role: number }).role;
    const body = await request.json();

    const parsed = clockActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid action', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // The session outlives a deactivation, so check the account itself before
    // recording paid time.
    const rules = await activePunchRules(userId);
    if (!rules) {
      return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
    }

    const { order, clockInStart } = rules;
    const { action } = parsed.data;
    const now = nowPstAsUtc();
    const { todayStart, todayEnd } = getTodayRangePST();

    // Find today's time log
    let log = await prisma.employeeTimeLog.findFirst({
      where: {
        idUser: userId,
        logDate: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    // Validate sequential order
    if (action === 'clockIn') {
      if (log?.clockIn) {
        return NextResponse.json({ error: 'Already clocked in today' }, { status: 400 });
      }
    } else {
      if (!log?.clockIn) {
        return NextResponse.json({ error: 'Must clock in first' }, { status: 400 });
      }
      if (log.clockOut) {
        return NextResponse.json({ error: 'Already clocked out for the day' }, { status: 400 });
      }

      // Verify the previous action in this employee's sequence is completed
      // (Janice takes lunch first; part-timers take one break and no lunch).
      const actionIndex = order.indexOf(action);
      if (actionIndex < 0) {
        return NextResponse.json(
          { error: `${action} is not part of your breaks.` },
          { status: 400 }
        );
      }
      if (actionIndex > 0) {
        const previousAction = order[actionIndex - 1];
        const previousValue = log[previousAction as keyof typeof log];
        if (!previousValue) {
          return NextResponse.json(
            { error: `Cannot perform ${action}. Must complete ${previousAction} first.` },
            { status: 400 }
          );
        }
      }

      // Check if this action is already completed
      const currentValue = log[action as keyof typeof log];
      if (currentValue) {
        return NextResponse.json(
          { error: `${action} already recorded` },
          { status: 400 }
        );
      }

      // An early clock-in is recorded as the shift start, so clocking out before
      // that recorded time (or in the same instant) would describe a shift
      // that ends before it starts. Such a day pays nothing, so refuse it.
      if (action === 'clockOut' && log.clockIn && now.getTime() <= log.clockIn.getTime()) {
        return NextResponse.json(
          { error: 'Clock-out must be later than your recorded clock-in time.' },
          { status: 400 }
        );
      }
    }

    // Lunch minimum 30-minute rule
    if (action === 'lunchIn' && log?.lunchOut) {
      const elapsed = minutesSinceStored(log.lunchOut);

      if (elapsed < 30) {
        const remaining = Math.ceil(30 - elapsed);
        return NextResponse.json(
          { error: `Lunch must be at least 30 minutes. ${remaining} minute(s) remaining.` },
          { status: 400 }
        );
      }
    }

    // Breaks have no minimum duration — employees may end a break whenever they
    // want (the 10-minute figure is only a soft limit shown in the UI). Lunch
    // keeps its 30-minute minimum above.

    // The time to record (PST as UTC-epoch). Only a clock-in is adjusted: one
    // before the employee's shift start is recorded as the start. The start is
    // read from the account, so a change applies to the next clock-in.
    const recordTime = action === 'clockIn' ? recordedClockIn(now, clockInStart, role) : now;

    // Perform the action
    if (action === 'clockIn') {
      if (log) {
        // Update existing log (e.g., created by skip action)
        log = await prisma.employeeTimeLog.update({
          where: { timeLogId: log.timeLogId },
          data: { clockIn: recordTime },
        });
      } else {
        log = await prisma.employeeTimeLog.create({
          data: {
            idUser: userId,
            logDate: todayStart,
            clockIn: recordTime,
            isModifiedByAdmin: false,
          },
        });
      }
    } else {
      log = await prisma.employeeTimeLog.update({
        where: { timeLogId: log!.timeLogId },
        data: { [action]: recordTime },
      });
    }

    return NextResponse.json({ data: log });
  } catch (error) {
    console.error('Clock action error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
