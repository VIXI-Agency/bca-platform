import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Get time logs for all (or one) employee for a given work week.
 * Query params: week=YYYY-MM-DD (Monday start), userId=number (optional)
 * Pay period: Monday to Friday (no weekends).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1 && role !== 2) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const weekParam = searchParams.get('week');
    const userIdParam = searchParams.get('userId');

    if (!weekParam || !/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      return NextResponse.json({ error: 'week parameter required (YYYY-MM-DD)' }, { status: 400 });
    }

    // Parse the Monday start date; week end = Monday + 5 days (Mon–Fri only)
    const parts = weekParam.split('-').map(Number);
    const weekStart = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 5);

    // Build conditions
    const conditions: Prisma.Sql[] = [
      Prisma.sql`t.LogDate >= ${weekStart}`,
      Prisma.sql`t.LogDate < ${weekEnd}`,
    ];

    if (userIdParam) {
      const uid = parseInt(userIdParam, 10);
      if (!isNaN(uid) && uid > 0) {
        conditions.push(Prisma.sql`t.IdUser = ${uid}`);
      }
    } else {
      // Only active employees (roles 1-3, not blocked)
      conditions.push(Prisma.sql`u.IdRole IN (1, 2, 3)`);
      conditions.push(Prisma.sql`(u.Status = 0 OR u.Status IS NULL)`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    const rows = await prisma.$queryRaw<Array<{
      TimeLogId: number;
      IdUser: number;
      Name: string | null;
      Lastname: string | null;
      LogDate: Date;
      ClockIn: Date | null;
      FirstBreakOut: Date | null;
      FirstBreakIn: Date | null;
      LunchOut: Date | null;
      LunchIn: Date | null;
      SecondBreakOut: Date | null;
      SecondBreakIn: Date | null;
      ClockOut: Date | null;
    }>>`
      SELECT t.TimeLogId, t.IdUser, u.Name, u.Lastname, t.LogDate,
             t.ClockIn, t.FirstBreakOut, t.FirstBreakIn,
             t.LunchOut, t.LunchIn, t.SecondBreakOut, t.SecondBreakIn, t.ClockOut
      FROM benjaise_sqluser2.EmployeeTimeLog t
      JOIN dbo.Users u ON u.IdUser = t.IdUser
      ${whereClause}
      ORDER BY u.Name, t.LogDate
    `;

    const data = rows.map((r) => ({
      timeLogId: r.TimeLogId,
      userId: r.IdUser,
      employeeName: `${r.Name ?? ''} ${r.Lastname ?? ''}`.trim(),
      date: r.LogDate.toISOString().split('T')[0],
      clockIn: r.ClockIn?.toISOString() ?? null,
      firstBreakOut: r.FirstBreakOut?.toISOString() ?? null,
      firstBreakIn: r.FirstBreakIn?.toISOString() ?? null,
      lunchOut: r.LunchOut?.toISOString() ?? null,
      lunchIn: r.LunchIn?.toISOString() ?? null,
      secondBreakOut: r.SecondBreakOut?.toISOString() ?? null,
      secondBreakIn: r.SecondBreakIn?.toISOString() ?? null,
      clockOut: r.ClockOut?.toISOString() ?? null,
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/admin/time/history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
