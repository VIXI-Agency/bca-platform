import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { payrollHistoryFilterSchema } from '@/lib/validators';
import type { Prisma } from '@prisma/client';
import { lastWorkDay, runGroup } from '@/lib/payroll/pay-schedule';

/** Lists saved pay statements (not live calculator output) — the permanent
 *  record of what was approved/paid, independent of current employee status
 *  or whatever rates/bonuses are typed in today. */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as { role: number }).role;
    if (role !== 1 && role !== 2) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = payrollHistoryFilterSchema.safeParse({
      userId: searchParams.get('userId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid filters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { userId, from, to, status, page, pageSize } = parsed.data;

    const where: Prisma.PayStatementWhereInput = {};
    if (userId) where.idUser = userId;
    if (status) where.status = status;
    if (from || to) {
      where.payRun = {};
      if (from) where.payRun.periodStart = { gte: new Date(from) };
      if (to) where.payRun.periodStart = { ...(where.payRun.periodStart as object), lte: new Date(to) };
    }

    const [total, statements] = await Promise.all([
      prisma.payStatement.count({ where }),
      prisma.payStatement.findMany({
        where,
        include: { payRun: { select: { periodStart: true, periodEnd: true, status: true } } },
        orderBy: [{ payRun: { periodStart: 'desc' } }, { employeeName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data = statements.map((s) => ({
      id: s.idStatement,
      userId: s.idUser,
      employeeName: s.employeeName,
      periodStart: s.payRun.periodStart.toISOString().split('T')[0],
      // Last workday (Thursday remote, Friday In House), not the exclusive end.
      periodEnd: lastWorkDay(runGroup(s.payRun.periodStart), s.payRun.periodStart).toISOString().split('T')[0],
      regularHours: Number(s.regularHours),
      overtimeHours: Number(s.overtimeHours),
      regularPay: Number(s.regularPay),
      overtimePay: Number(s.overtimePay),
      bonusTotal: Number(s.bonusTotal),
      grossPay: Number(s.grossPay),
      status: s.status,
      paymentMethod: s.paymentMethod,
      paymentReference: s.paymentReference,
      paidDate: s.paidDate?.toISOString().split('T')[0] ?? null,
    }));

    return NextResponse.json({ data, total, page, pageSize });
  } catch (error) {
    console.error('Payroll history GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
