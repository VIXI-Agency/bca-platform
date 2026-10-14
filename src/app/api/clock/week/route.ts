import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { getPayPeriodEnd, resolvePayPeriodStart } from '@/lib/time';
import { computeDayMetrics, disconnectionKey, fetchDisconnectionWindows } from '@/lib/payroll/compute';

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

    // Pay period Friday, and the next Friday (exclusive) → covers Fri–Thu
    const periodStart = resolvePayPeriodStart(parsed.data.week);
    const weekEnd = getPayPeriodEnd(periodStart);

    // Fetch all logs and disconnections for this pay period
    const [logs, disconnections] = await Promise.all([
      prisma.employeeTimeLog.findMany({
        where: {
          idUser: userId,
          logDate: {
            gte: periodStart,
            lt: weekEnd,
          },
        },
        orderBy: { logDate: 'asc' },
      }),
      fetchDisconnectionWindows(periodStart, weekEnd, userId),
    ]);

    // Defensive: exclude Saturday (6) and Sunday (0) — no work falls on weekends
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
      const metrics = computeDayMetrics(log, disconnections.get(disconnectionKey(userId, log.logDate)));
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
        // Everything paid that day (regular + overtime). metrics.totalHours
        // alone is capped at 8, so a 10h day read 8:00 to the employee.
        totalHours: Math.round((metrics.totalHours + metrics.overtime) * 100) / 100,
        overtime: metrics.overtime,
        disconnectedMinutes: metrics.disconnectedMinutes,
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
