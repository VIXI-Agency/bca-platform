import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { getTodayRangePST } from '@/lib/time';

/**
 * Get the Monday start date for the work week containing the given date.
 * Pay period: Monday to Friday (no weekends).
 */
function getMondayStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  // Days since last Monday: Mon(1)->0, Tue(2)->1, ..., Fri(5)->4, Sat(6)->5, Sun(0)->6
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

interface TimeLogRow {
  timeLogId: number;
  idUser: number;
  logDate: Date;
  clockIn: Date | null;
  firstBreakOut: Date | null;
  firstBreakIn: Date | null;
  lunchOut: Date | null;
  lunchIn: Date | null;
  secondBreakOut: Date | null;
  secondBreakIn: Date | null;
  clockOut: Date | null;
  isModifiedByAdmin: boolean | null;
}

function computeDayMetrics(log: TimeLogRow) {
  let totalHours = 0;
  let overtime = 0;
  let firstBreakExcess = 0;
  let secondBreakExcess = 0;
  let lunchDurationMinutes = 0;

  if (log.clockIn && log.clockOut) {
    const clockInMs = new Date(log.clockIn).getTime();
    let clockOutMs = new Date(log.clockOut).getTime();
    // Handle overnight shifts: if clockOut is before clockIn, add 24 hours
    if (clockOutMs <= clockInMs) {
      clockOutMs += 24 * 60 * 60 * 1000;
    }

    // Calculate lunch duration
    let lunchMs = 0;
    if (log.lunchOut && log.lunchIn) {
      const lunchOutMs = new Date(log.lunchOut).getTime();
      let lunchInMs = new Date(log.lunchIn).getTime();
      if (lunchInMs < lunchOutMs) lunchInMs += 24 * 60 * 60 * 1000;
      lunchMs = lunchInMs - lunchOutMs;
      lunchDurationMinutes = lunchMs / (1000 * 60);
    }

    // Calculate break excess (over 10 minutes)
    if (log.firstBreakOut && log.firstBreakIn) {
      const bOutMs = new Date(log.firstBreakOut).getTime();
      let bInMs = new Date(log.firstBreakIn).getTime();
      if (bInMs < bOutMs) bInMs += 24 * 60 * 60 * 1000;
      const breakMinutes = (bInMs - bOutMs) / (1000 * 60);
      if (breakMinutes > 10) {
        firstBreakExcess = Math.round((breakMinutes - 10) * 100) / 100;
      }
    }

    if (log.secondBreakOut && log.secondBreakIn) {
      const bOutMs = new Date(log.secondBreakOut).getTime();
      let bInMs = new Date(log.secondBreakIn).getTime();
      if (bInMs < bOutMs) bInMs += 24 * 60 * 60 * 1000;
      const breakMinutes = (bInMs - bOutMs) / (1000 * 60);
      if (breakMinutes > 10) {
        secondBreakExcess = Math.round((breakMinutes - 10) * 100) / 100;
      }
    }

    // Total hours: (ClockOut - ClockIn - LunchDuration - BreakExcess) / 3600
    const breakExcessMs = (firstBreakExcess + secondBreakExcess) * 60 * 1000;
    const rawMs = clockOutMs - clockInMs - lunchMs - breakExcessMs;
    totalHours = Math.round((rawMs / (1000 * 3600)) * 100) / 100;
    totalHours = Math.max(0, totalHours);

    // Cap at 8, compute overtime
    if (totalHours > 8) {
      overtime = Math.round((totalHours - 8) * 100) / 100;
      totalHours = 8;
    }
  }

  return {
    totalHours,
    overtime,
    firstBreakExcess,
    secondBreakExcess,
    lunchDurationMinutes: Math.round(lunchDurationMinutes * 100) / 100,
  };
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;
    const { searchParams } = new URL(request.url);

    const parsed = clockWeekSchema.safeParse({ week: searchParams.get('week') || undefined });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid week parameter', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Determine the Monday start date
    let mondayStart: Date;
    if (parsed.data.week) {
      const parts = parsed.data.week.split('-').map(Number);
      const inputDate = new Date(parts[0], parts[1] - 1, parts[2]);
      mondayStart = getMondayStart(inputDate);
    } else {
      const { todayStart } = getTodayRangePST();
      mondayStart = getMondayStart(todayStart);
    }

    // Week end = Monday + 5 days (Saturday, exclusive) → covers Mon–Fri only
    const weekEnd = new Date(mondayStart);
    weekEnd.setDate(weekEnd.getDate() + 5);

    // Fetch all logs for this week
    const logs = await prisma.employeeTimeLog.findMany({
      where: {
        idUser: userId,
        logDate: {
          gte: mondayStart,
          lt: weekEnd,
        },
      },
      orderBy: { logDate: 'asc' },
    });

    // Defensive: exclude Saturday (6) and Sunday (0) — pay period is Mon–Fri
    const filteredLogs = logs.filter((log) => {
      const day = new Date(log.logDate).getUTCDay();
      return day !== 0 && day !== 6;
    });

    // Map day-of-week names
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Time fields are SQL Server TIME type — Prisma returns epoch dates (1970-01-01).
    // Extract UTC hours/minutes and return as ISO strings for consistent frontend formatting.
    function fixTime(t: Date | null): string | null {
      if (!t) return null;
      return t.toISOString();
    }

    // Compute metrics for each day and add dayOfWeek
    const days = filteredLogs.map((log) => {
      const metrics = computeDayMetrics(log);
      const dayIndex = new Date(log.logDate).getUTCDay();
      return {
        dayOfWeek: dayNames[dayIndex],
        clockIn: fixTime(log.clockIn),
        firstBreakOut: fixTime(log.firstBreakOut),
        firstBreakIn: fixTime(log.firstBreakIn),
        lunchOut: fixTime(log.lunchOut),
        lunchIn: fixTime(log.lunchIn),
        secondBreakOut: fixTime(log.secondBreakOut),
        secondBreakIn: fixTime(log.secondBreakIn),
        clockOut: fixTime(log.clockOut),
        totalHours: metrics.totalHours,
        isModifiedByAdmin: log.isModifiedByAdmin ?? false,
      };
    });

    // Compute week total
    const weekTotal = Math.round(days.reduce((sum, d) => sum + d.totalHours, 0) * 100) / 100;

    return NextResponse.json({
      data: days,
      weekTotal,
    });
  } catch (error) {
    console.error('Clock week error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
