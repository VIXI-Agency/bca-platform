import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { resolveUserPeriod } from '@/lib/payroll/pay-schedule-db';
import { periodLabel, periodWorkDates } from '@/lib/payroll/pay-schedule';
import { computeDayMetrics, disconnectionKey, fetchDisconnectionWindows } from '@/lib/payroll/compute';
import { toAuditDtos, fetchDisconnectionAudits } from '@/lib/admin-time/audit-dto';

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
    if (role !== 1) {
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

    // This employee's own pay period: Fri–Thu remote, Mon–Fri In House.
    const period = await resolveUserPeriod(targetUserId, parsed.data.week);
    const { start: periodStart, end: weekEnd } = period;

    // Fetch time logs, audit trail and disconnections in parallel
    const [logs, audits, user, disconnections, payRun] = await Promise.all([
      prisma.employeeTimeLog.findMany({
        where: {
          idUser: targetUserId,
          logDate: {
            gte: periodStart,
            lt: weekEnd,
          },
        },
        orderBy: { logDate: 'asc' },
      }),
      prisma.employeeTimeLogAudit.findMany({
        where: {
          idUser: String(targetUserId),
          modifiedDate: {
            gte: periodStart,
            lt: weekEnd,
          },
        },
        orderBy: { modifiedDate: 'desc' },
      }),
      prisma.user.findUnique({
        where: { idUser: targetUserId },
        select: { idUser: true, name: true, lastname: true, isPartTime: true },
      }),
      fetchDisconnectionWindows(periodStart, weekEnd, targetUserId),
      // Lets the UI say up front that an approved/paid period is locked,
      // instead of the admin finding out from a 409 on save.
      prisma.payRun.findUnique({ where: { periodStart }, select: { status: true } }),
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
      ...computeDayMetrics(log, disconnections.get(disconnectionKey(targetUserId, log.logDate))),
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
      disconnectedMinutes: Math.round(days.reduce((sum, d) => sum + d.disconnectedMinutes, 0) * 100) / 100,
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
      disconnectedMinutes: d.disconnectedMinutes,
      modifiedFields: d.audits.map((a: { fieldModified: string | null }) => a.fieldModified).filter(Boolean),
      isModifiedByAdmin: d.isModifiedByAdmin ?? false,
    }));

    // Return a row for every working day in the pay period (Fri, Mon, Tue, Wed,
    // Thu — no weekends), filling days with no log with an empty placeholder.
    // This lets admins click an empty cell to add hours for a day the employee
    // never clocked (e.g. forgot to clock in entirely); the edit endpoint
    // creates the log on first save.
    const byDate = new Map(transformedDays.map((d) => [d.date, d]));
    const fullWeek = periodWorkDates(period).map((date) => {
      return (
        byDate.get(date) ?? {
          date,
          clockIn: undefined,
          firstBreakOut: undefined,
          firstBreakIn: undefined,
          lunchOut: undefined,
          lunchIn: undefined,
          secondBreakOut: undefined,
          secondBreakIn: undefined,
          clockOut: undefined,
          totalHours: 0,
          overtime: 0,
          firstBreakExcess: 0,
          secondBreakExcess: 0,
          lunchDurationMinutes: 0,
          disconnectedMinutes: 0,
          modifiedFields: [] as string[],
          isModifiedByAdmin: false,
        }
      );
    });

    // Time edits plus disconnection changes, with names for the employee and
    // each editor (stored as raw idUser strings).
    const transformedAudits = await toAuditDtos(
      audits,
      await fetchDisconnectionAudits(periodStart, weekEnd, targetUserId),
    );

    return NextResponse.json({
      data: fullWeek,
      audits: transformedAudits,
      employee: user,
      weekStart: periodStart.toISOString().split('T')[0],
      paySchedule: period.schedule,
      periodLabel: periodLabel(period),
      weekEnd: new Date(weekEnd.getTime() - 1).toISOString().split('T')[0],
      weekTotals,
      payRunStatus: payRun?.status ?? null,
    });
  } catch (error) {
    console.error('Admin time userId GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
