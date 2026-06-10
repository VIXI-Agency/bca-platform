import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockActionSchema } from '@/lib/validators';
import { nowPstAsUtc, getPstHour, getTodayRangePST, minutesSinceStored } from '@/lib/time';

// Sequential order of clock actions
const ACTION_ORDER = [
  'clockIn',
  'firstBreakOut',
  'firstBreakIn',
  'lunchOut',
  'lunchIn',
  'secondBreakOut',
  'secondBreakIn',
  'clockOut',
] as const;

function applyEarlyClockInRule(time: Date): Date {
  if (getPstHour() < 6) {
    // Set to 6:00 AM PST (stored as UTC epoch)
    return new Date(Date.UTC(1970, 0, 1, 6, 0, 0));
  }
  return time;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;
    const body = await request.json();

    const parsed = clockActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid action', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

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

      // Verify the previous action in sequence is completed
      const actionIndex = ACTION_ORDER.indexOf(action as typeof ACTION_ORDER[number]);
      if (actionIndex > 0) {
        const previousAction = ACTION_ORDER[actionIndex - 1];
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

    // Break minimum 10-minute rule (applies to both the first and second break)
    if (action === 'firstBreakIn' && log?.firstBreakOut) {
      const elapsed = minutesSinceStored(log.firstBreakOut);
      if (elapsed < 10) {
        const remaining = Math.ceil(10 - elapsed);
        return NextResponse.json(
          { error: `Break must be at least 10 minutes. ${remaining} minute(s) remaining.` },
          { status: 400 }
        );
      }
    }
    if (action === 'secondBreakIn' && log?.secondBreakOut) {
      const elapsed = minutesSinceStored(log.secondBreakOut);
      if (elapsed < 10) {
        const remaining = Math.ceil(10 - elapsed);
        return NextResponse.json(
          { error: `Break must be at least 10 minutes. ${remaining} minute(s) remaining.` },
          { status: 400 }
        );
      }
    }

    // Determine the time to record (PST as UTC-epoch)
    let recordTime = now;
    if (action === 'clockIn') {
      recordTime = applyEarlyClockInRule(now);
    }

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
