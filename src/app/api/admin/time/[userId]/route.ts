import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { getPayPeriodEnd, getPayPeriodWorkDates, resolvePayPeriodStart } from '@/lib/time';
import { computeDayMetrics, disconnectionKey, fetchDisconnectionWindows } from '@/lib/payroll/compute';

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

    // Pay period Friday, and the next Friday (exclusive) → covers Fri–Thu
    const periodStart = resolvePayPeriodStart(parsed.data.week);
    const weekEnd = getPayPeriodEnd(periodStart);

    // Fetch time logs, audit trail and disconnections in parallel
    const [logs, audits, user, disconnections] = await Promise.all([
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
    const fullWeek = getPayPeriodWorkDates(periodStart).map((date) => {
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

    // modifiedBy is stored as a raw idUser string — resolve it to a name so
    // the audit trail doesn't just show "262".
    const modifierIds = Array.from(
      new Set(
        audits
          .map((a) => a.modifiedBy)
          .filter((v): v is string => !!v && /^\d+$/.test(v))
      )
    ).map(Number);
    const modifiers = modifierIds.length
      ? await prisma.user.findMany({
          where: { idUser: { in: modifierIds } },
          select: { idUser: true, name: true, lastname: true },
        })
      : [];
    const modifierNames = new Map(
      modifiers.map((m) => [
        String(m.idUser),
        `${m.name ?? ''} ${m.lastname ?? ''}`.trim() || `User #${m.idUser}`,
      ])
    );

    const transformedAudits = audits.map((a) => ({
      id: a.auditId,
      userId: targetUserId,
      employeeName: `${user.name ?? ''} ${user.lastname ?? ''}`.trim(),
      date: new Date(a.modifiedDate).toISOString().split('T')[0],
      field: a.fieldModified ?? '',
      oldValue: a.oldValue,
      newValue: a.newValue ?? '',
      modifiedBy: a.modifiedBy ? (modifierNames.get(a.modifiedBy) ?? a.modifiedBy) : '',
      modifiedAt: a.modifiedDate?.toISOString() ?? '',
      reason: a.reason ?? '',
    }));

    return NextResponse.json({
      data: fullWeek,
      audits: transformedAudits,
      employee: user,
      weekStart: periodStart.toISOString().split('T')[0],
      weekEnd: new Date(weekEnd.getTime() - 1).toISOString().split('T')[0],
      weekTotals,
    });
  } catch (error) {
    console.error('Admin time userId GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
