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
  const dayOfWeek = d.getUTCDay();
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

    let lunchMs = 0;
    if (log.lunchOut && log.lunchIn) {
      const lunchOutMs = new Date(log.lunchOut).getTime();
      let lunchInMs = new Date(log.lunchIn).getTime();
      if (lunchInMs < lunchOutMs) lunchInMs += 24 * 60 * 60 * 1000;
      lunchMs = lunchInMs - lunchOutMs;
      lunchDurationMinutes = lunchMs / (1000 * 60);
    }

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

    const breakExcessMs = (firstBreakExcess + secondBreakExcess) * 60 * 1000;
    const rawMs = clockOutMs - clockInMs - lunchMs - breakExcessMs;
    totalHours = Math.round((rawMs / (1000 * 3600)) * 100) / 100;
    totalHours = Math.max(0, totalHours);

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

    // Week end = Monday + 5 days (Saturday, exclusive) → Mon–Fri only
    const weekEnd = new Date(mondayStart);
    weekEnd.setDate(weekEnd.getDate() + 5);

    // Fetch time logs and audit trail in parallel
    const [logs, audits, user] = await Promise.all([
      prisma.employeeTimeLog.findMany({
        where: {
          idUser: targetUserId,
          logDate: {
            gte: mondayStart,
            lt: weekEnd,
          },
        },
        orderBy: { logDate: 'asc' },
      }),
      prisma.employeeTimeLogAudit.findMany({
        where: {
          idUser: String(targetUserId),
          modifiedDate: {
            gte: mondayStart,
            lt: weekEnd,
          },
        },
        orderBy: { modifiedDate: 'desc' },
      }),
      prisma.user.findUnique({
        where: { idUser: targetUserId },
        select: { idUser: true, name: true, lastname: true, isPartTime: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Filter out Saturday and Sunday
    const filteredLogs = logs.filter((log: { logDate: Date }) => {
      const day = new Date(log.logDate).getUTCDay();
      return day !== 0 && day !== 6;
    });

    // Compute metrics for each day
    const days = filteredLogs.map((log) => ({
      ...log,
      ...computeDayMetrics(log),
      audits: audits.filter((a) => {
        // Match audit entries to the log date
        const auditDate = new Date(a.modifiedDate);
        const logDate = new Date(log.logDate);
        return (
          auditDate.getFullYear() === logDate.getFullYear() &&
          auditDate.getMonth() === logDate.getMonth() &&
          auditDate.getDate() === logDate.getDate()
        );
      }).map((a) => ({
        id: a.auditId,
        modifiedBy: a.modifiedBy,
        modifiedDate: a.modifiedDate,
        fieldModified: a.fieldModified,
        oldValue: a.oldValue,
        newValue: a.newValue,
        reason: a.reason,
      })),
    }));

    // Week totals
    const weekTotals = {
      totalHours: Math.round(days.reduce((sum, d) => sum + d.totalHours, 0) * 100) / 100,
      overtime: Math.round(days.reduce((sum, d) => sum + d.overtime, 0) * 100) / 100,
      firstBreakExcess: Math.round(days.reduce((sum, d) => sum + d.firstBreakExcess, 0) * 100) / 100,
      secondBreakExcess: Math.round(days.reduce((sum, d) => sum + d.secondBreakExcess, 0) * 100) / 100,
    };

    // Transform to match frontend { data: DayLog[], audits: Audit[] } shape
    const transformedDays = days.map((d) => ({
      date: new Date(d.logDate).toISOString().split('T')[0],
      clockIn: d.clockIn?.toISOString() ?? undefined,
      firstBreakOut: d.firstBreakOut?.toISOString() ?? undefined,
      firstBreakIn: d.firstBreakIn?.toISOString() ?? undefined,
      lunchOut: d.lunchOut?.toISOString() ?? undefined,
      lunchIn: d.lunchIn?.toISOString() ?? undefined,
      secondBreakOut: d.secondBreakOut?.toISOString() ?? undefined,
      secondBreakIn: d.secondBreakIn?.toISOString() ?? undefined,
      clockOut: d.clockOut?.toISOString() ?? undefined,
      totalHours: d.totalHours,
      overtime: d.overtime,
      firstBreakExcess: d.firstBreakExcess,
      secondBreakExcess: d.secondBreakExcess,
      lunchDurationMinutes: d.lunchDurationMinutes,
      modifiedFields: d.audits.map((a: { fieldModified: string | null }) => a.fieldModified).filter(Boolean),
      isModifiedByAdmin: d.isModifiedByAdmin ?? false,
    }));

    const transformedAudits = audits.map((a) => ({
      id: a.auditId,
      userId: targetUserId,
      employeeName: `${user.name ?? ''} ${user.lastname ?? ''}`.trim(),
      date: new Date(a.modifiedDate).toISOString().split('T')[0],
      field: a.fieldModified ?? '',
      oldValue: a.oldValue,
      newValue: a.newValue ?? '',
      modifiedBy: a.modifiedBy ?? '',
      modifiedAt: a.modifiedDate?.toISOString() ?? '',
      reason: a.reason ?? '',
    }));

    return NextResponse.json({
      data: transformedDays,
      audits: transformedAudits,
      employee: user,
      weekStart: mondayStart.toISOString().split('T')[0],
      weekEnd: new Date(weekEnd.getTime() - 1).toISOString().split('T')[0],
      weekTotals,
    });
  } catch (error) {
    console.error('Admin time userId GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
