import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema, payRunApproveSchema } from '@/lib/validators';
import { getTodayRangePST, getPayPeriodStart } from '@/lib/time';
import { computePayStatement } from '@/lib/payroll/compute';
import { BONUS_FIELDS, BONUS_FIELD_LABELS } from '@/lib/payroll/constants';

function resolvePeriodStart(week: string | null): Date {
  if (week) {
    const parts = week.split('-').map(Number);
    const inputDate = new Date(parts[0], parts[1] - 1, parts[2]);
    return getPayPeriodStart(inputDate);
  }
  const { todayStart } = getTodayRangePST();
  return getPayPeriodStart(todayStart);
}

async function activeEmployees() {
  return prisma.user.findMany({
    where: { OR: [{ status: null }, { status: false }], idRole: { in: [1, 2, 3] } },
    select: { idUser: true, name: true, lastname: true },
    orderBy: [{ name: 'asc' }, { lastname: 'asc' }],
  });
}

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
    const parsed = clockWeekSchema.safeParse({ week: searchParams.get('week') || undefined });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid week parameter', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const periodStart = resolvePeriodStart(parsed.data.week ?? null);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 7);

    const run = await prisma.payRun.findUnique({
      where: { periodStart },
      include: { statements: { orderBy: { employeeName: 'asc' } } },
    });

    if (run) {
      return NextResponse.json({
        isLive: false,
        run: {
          id: run.idPayRun,
          periodStart: run.periodStart.toISOString().split('T')[0],
          periodEnd: run.periodEnd.toISOString().split('T')[0],
          status: run.status,
          scheduledPayDate: run.scheduledPayDate?.toISOString().split('T')[0] ?? null,
          notes: run.notes ?? '',
        },
        statements: run.statements.map((s) => ({
          id: s.idStatement,
          userId: s.idUser,
          employeeName: s.employeeName,
          regularHours: Number(s.regularHours),
          overtimeHours: Number(s.overtimeHours),
          payRate: s.payRate != null ? Number(s.payRate) : null,
          otPayRate: s.otPayRate != null ? Number(s.otPayRate) : null,
          regularPay: Number(s.regularPay),
          overtimePay: Number(s.overtimePay),
          bonusTotal: Number(s.bonusTotal),
          grossPay: Number(s.grossPay),
          status: s.status,
          paymentMethod: s.paymentMethod,
          paymentReference: s.paymentReference,
          paidDate: s.paidDate?.toISOString().split('T')[0] ?? null,
        })),
      });
    }

    // No run yet for this period — compute a live preview for every active
    // employee so the admin can see what approving would snapshot.
    const employees = await activeEmployees();
    const statements = await Promise.all(
      employees.map(async (emp) => {
        const amounts = await computePayStatement(emp.idUser, periodStart);
        return {
          id: null,
          userId: emp.idUser,
          employeeName: `${emp.name ?? ''} ${emp.lastname ?? ''}`.trim(),
          regularHours: amounts.regularHours,
          overtimeHours: amounts.overtimeHours,
          payRate: amounts.payRate,
          otPayRate: amounts.otPayRate,
          regularPay: amounts.regularPay,
          overtimePay: amounts.overtimePay,
          bonusTotal: amounts.bonusTotal,
          grossPay: amounts.grossPay,
          status: 'pending' as const,
          paymentMethod: null,
          paymentReference: null,
          paidDate: null,
        };
      }),
    );

    return NextResponse.json({
      isLive: true,
      run: {
        id: null,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: new Date(periodEnd.getTime() - 1).toISOString().split('T')[0],
        status: null,
        scheduledPayDate: null,
        notes: '',
      },
      statements,
    });
  } catch (error) {
    console.error('Payroll runs GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Approve (or re-approve) a pay period: snapshots every active employee's
 *  current hours/rate/bonus breakdown into PayStatements that stop tracking
 *  live edits from this point on. Only the owner can approve payroll. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as { role: number }).role;
    const adminUserId = (session.user as { userId: number }).userId;
    if (role !== 1) {
      return NextResponse.json({ error: 'Only an administrator can approve payroll' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = payRunApproveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { period, scheduledPayDate, notes } = parsed.data;
    const parts = period.split('-').map(Number);
    const periodStart = getPayPeriodStart(new Date(parts[0], parts[1] - 1, parts[2]));
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 7);

    const existing = await prisma.payRun.findUnique({ where: { periodStart } });
    if (existing?.status === 'paid') {
      return NextResponse.json(
        { error: 'This pay run has already been paid and cannot be re-approved.' },
        { status: 409 }
      );
    }

    const scheduledDate = scheduledPayDate
      ? (() => {
          const p = scheduledPayDate.split('-').map(Number);
          return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
        })()
      : null;

    const run = await prisma.payRun.upsert({
      where: { periodStart },
      create: {
        periodStart,
        periodEnd,
        status: 'approved',
        scheduledPayDate: scheduledDate,
        notes: notes || null,
        approvedBy: String(adminUserId),
        approvedAt: new Date(),
      },
      update: {
        status: 'approved',
        scheduledPayDate: scheduledDate,
        notes: notes || null,
        approvedBy: String(adminUserId),
        approvedAt: new Date(),
        voidedBy: null,
        voidedAt: null,
        voidReason: null,
      },
    });

    const employees = await activeEmployees();

    for (const emp of employees) {
      const amounts = await computePayStatement(emp.idUser, periodStart);
      const employeeName = `${emp.name ?? ''} ${emp.lastname ?? ''}`.trim();
      const statementData = {
        employeeName,
        regularHours: amounts.regularHours,
        overtimeHours: amounts.overtimeHours,
        payRate: amounts.payRate,
        otPayRate: amounts.otPayRate,
        regularPay: amounts.regularPay,
        overtimePay: amounts.overtimePay,
        bonusTotal: amounts.bonusTotal,
        grossPay: amounts.grossPay,
      };

      // Atomic guard against a concurrent "mark paid": a plain upsert would
      // unconditionally overwrite a statement another request just marked
      // paid between a pre-loop read and this write. Scoping the update's
      // WHERE to status != 'paid' makes the database itself enforce "never
      // overwrite a paid statement", not a snapshot taken before the loop.
      const updated = await prisma.payStatement.updateMany({
        where: { idPayRun: run.idPayRun, idUser: emp.idUser, status: { not: 'paid' } },
        data: { ...statementData, status: 'pending' },
      });

      let statementId: number;
      if (updated.count > 0) {
        const row = await prisma.payStatement.findUniqueOrThrow({
          where: { idPayRun_idUser: { idPayRun: run.idPayRun, idUser: emp.idUser } },
          select: { idStatement: true },
        });
        statementId = row.idStatement;
      } else {
        // Nothing updated: either no statement exists yet, or it exists and
        // is already paid (in which case we leave it untouched).
        const existing = await prisma.payStatement.findUnique({
          where: { idPayRun_idUser: { idPayRun: run.idPayRun, idUser: emp.idUser } },
          select: { idStatement: true },
        });
        if (existing) continue;
        const created = await prisma.payStatement.create({
          data: { idPayRun: run.idPayRun, idUser: emp.idUser, ...statementData, status: 'pending' },
        });
        statementId = created.idStatement;
      }

      const lines: { kind: string; category: string | null; label: string; quantity: number | null; rate: number | null; amount: number }[] = [
        { kind: 'regular', category: null, label: 'Regular', quantity: amounts.regularHours, rate: amounts.payRate, amount: amounts.regularPay },
      ];
      if (amounts.overtimeHours > 0) {
        lines.push({ kind: 'overtime', category: null, label: 'Overtime', quantity: amounts.overtimeHours, rate: amounts.otPayRate, amount: amounts.overtimePay });
      }
      for (const key of BONUS_FIELDS) {
        const amount = amounts.bonusAmounts[key];
        if (amount > 0) {
          lines.push({ kind: 'bonus', category: key, label: BONUS_FIELD_LABELS[key], quantity: null, rate: null, amount });
        }
      }

      await prisma.$transaction([
        prisma.payStatementLine.deleteMany({ where: { idStatement: statementId } }),
        prisma.payStatementLine.createMany({
          data: lines.map((l) => ({ ...l, idStatement: statementId })),
        }),
      ]);
    }

    return NextResponse.json({ success: true, runId: run.idPayRun });
  } catch (error) {
    console.error('Payroll runs POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
