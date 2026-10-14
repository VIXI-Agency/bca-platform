import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTodayRangePST, storedTimeToSeconds, nowPstSeconds } from '@/lib/time';
function getEmployeeStatus(log: {
  clockIn: Date | null;
  firstBreakOut: Date | null;
  firstBreakIn: Date | null;
  lunchOut: Date | null;
  lunchIn: Date | null;
  secondBreakOut: Date | null;
  secondBreakIn: Date | null;
  clockOut: Date | null;
} | null): string {
  if (!log || !log.clockIn) return 'not_clocked_in';
  if (log.clockOut) return 'clocked_out';
  if (log.secondBreakOut && !log.secondBreakIn) return 'on_break';
  if (log.lunchOut && !log.lunchIn) return 'at_lunch';
  if (log.firstBreakOut && !log.firstBreakIn) return 'on_break';
  return 'working';
}

function getCurrentBreakStart(log: {
  firstBreakOut: Date | null;
  firstBreakIn: Date | null;
  lunchOut: Date | null;
  lunchIn: Date | null;
  secondBreakOut: Date | null;
  secondBreakIn: Date | null;
} | null): Date | null {
  if (!log) return null;
  if (log.secondBreakOut && !log.secondBreakIn) return log.secondBreakOut;
  if (log.lunchOut && !log.lunchIn) return log.lunchOut;
  if (log.firstBreakOut && !log.firstBreakIn) return log.firstBreakOut;
  return null;
}

/**
 * Combine a @db.Date logDate with a @db.Time value to produce a real datetime.
 * Prisma maps SQL Server `time` columns to Date objects with a 1970-01-01 date part,
 * so we extract HH:MM:SS from the time value and graft it onto logDate.
 */
function combineDateTime(logDate: Date, timeVal: Date | null): string | null {
  if (!timeVal) return null;
  // Extract the time portion (UTC hours/minutes/seconds from the 1970 Date)
  const h = String(timeVal.getUTCHours()).padStart(2, '0');
  const m = String(timeVal.getUTCMinutes()).padStart(2, '0');
  const s = String(timeVal.getUTCSeconds()).padStart(2, '0');
  // Extract the date portion from logDate
  const year = logDate.getUTCFullYear();
  const month = String(logDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(logDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}T${h}:${m}:${s}.000Z`;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { todayStart, todayEnd } = getTodayRangePST();
    const currentPstSec = nowPstSeconds();

    // Fetch all active employees, today's time logs, and active disconnections in parallel
    const [employees, logs, activeDisconnections] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [{ status: null }, { status: false }],
          idRole: { in: [1, 2, 3] },
        },
        select: {
          idUser: true,
          name: true,
          lastname: true,
          idRole: true,
          isPartTime: true,
        },
        orderBy: [{ name: 'asc' }, { lastname: 'asc' }],
      }),
      prisma.employeeTimeLog.findMany({
        where: {
          logDate: { gte: todayStart, lt: todayEnd },
        },
      }),
      // Today's open disconnections only — one never closed on an earlier
      // day would otherwise show the employee as disconnected forever.
      prisma.employeeDisconnection.findMany({
        where: {
          reconnectionTime: null,
          disconnectionDate: todayStart,
        },
        select: { idUser: true },
      }),
    ]);

    // Map logs by userId
    const logsByUser = new Map(logs.map((log) => [log.idUser, log]));

    const disconnectedUserIds = new Set(activeDisconnections.map((d) => d.idUser));

    const data = employees.map((emp) => {
      const log = logsByUser.get(emp.idUser) || null;
      const status = getEmployeeStatus(log);
      const breakStart = getCurrentBreakStart(log);

      // Determine if break is exceeded (10-minute limit for breaks, not lunch)
      let breakExceeded = false;
      if (breakStart && status !== 'at_lunch') {
        const breakSec = storedTimeToSeconds(breakStart);
        const elapsedSec = currentPstSec - breakSec;
        breakExceeded = elapsedSec > 10 * 60;
      }

      const logDate = log?.logDate ?? new Date();

      return {
        userId: emp.idUser,
        name: `${emp.name} ${emp.lastname}`,
        role: emp.idRole,
        isPartTime: emp.isPartTime,
        status,
        clockIn: combineDateTime(logDate, log?.clockIn ?? null),
        firstBreakOut: combineDateTime(logDate, log?.firstBreakOut ?? null),
        firstBreakIn: combineDateTime(logDate, log?.firstBreakIn ?? null),
        lunchOut: combineDateTime(logDate, log?.lunchOut ?? null),
        lunchIn: combineDateTime(logDate, log?.lunchIn ?? null),
        secondBreakOut: combineDateTime(logDate, log?.secondBreakOut ?? null),
        secondBreakIn: combineDateTime(logDate, log?.secondBreakIn ?? null),
        clockOut: combineDateTime(logDate, log?.clockOut ?? null),
        currentBreakStart: combineDateTime(logDate, breakStart),
        breakExceeded,
        isDisconnected: disconnectedUserIds.has(emp.idUser),
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Admin time GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
