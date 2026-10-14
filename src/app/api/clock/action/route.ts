import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockActionSchema } from '@/lib/validators';
import { nowPstAsUtc, getTodayRangePST, minutesSinceStored } from '@/lib/time';

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

// Administrator (1) and Closer (2) may clock in up to 15 minutes before their
// 6:00 AM shift and have that real time count toward pay. Everyone else
// (Remote Agent, etc.) keeps the original rule: any clock-in before 6:00 AM
// is snapped to exactly 6:00, no matter how early they actually punched in.
const EARLY_CLOCK_IN_ROLES = [1, 2];

function applyEarlyClockInRule(time: Date, role: number | undefined): Date {
  const minutesOfDay = time.getUTCHours() * 60 + time.getUTCMinutes();
  const sixAm = 6 * 60;
  if (minutesOfDay >= sixAm) {
    return time;
  }

  if (role != null && EARLY_CLOCK_IN_ROLES.includes(role)) {
    const fiveFortyFive = sixAm - 15;
    if (minutesOfDay >= fiveFortyFive) {
      return time;
    }
    return new Date(Date.UTC(1970, 0, 1, 5, 45, 0));
  }

  return new Date(Date.UTC(1970, 0, 1, 6, 0, 0));
}

async function isAccountBlocked(userId: number): Promise<boolean> {
  const account = await prisma.user.findUnique({ where: { idUser: userId }, select: { status: true } });
  return !account || account.status === true;
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
    if (await isAccountBlocked(userId)) {
      return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
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

      // An early clock-in is recorded as 5:45/6:00, so clocking out before
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

    // Determine the time to record (PST as UTC-epoch)
    let recordTime = now;
    if (action === 'clockIn') {
      recordTime = applyEarlyClockInRule(now, role);
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
