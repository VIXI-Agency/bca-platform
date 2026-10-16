import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema, payRunApproveSchema } from '@/lib/validators';
import { getPayPeriodEnd, getTodayRangePST, parseDateParam } from '@/lib/time';
import { computePayStatement, type PayStatementAmounts } from '@/lib/payroll/compute';
import { payScheduleHistories } from '@/lib/payroll/pay-schedule-db';
import { PAY_SCHEDULES, lastWorkDay, scheduleOn, weekStart, type PaySchedule } from '@/lib/payroll/pay-schedule';
import { BONUS_FIELDS, BONUS_FIELD_LABELS, isCountedBonus } from '@/lib/payroll/constants';

const isoDate = (d: Date) => d.toISOString().split('T')[0];

/**
 * Everyone on this period's payroll: active employees, plus anyone who
 * logged time in the period and has since been deactivated — they are
 * still owed for the days they worked (e.g. a final paycheck). Only those
 * on this group's pay week when it starts: remote employees are on the
 * Friday payroll, In House employees on the Monday one.
 */
async function payrollEmployees(periodStart: Date, periodEnd: Date, group: PaySchedule) {
  const worked = await prisma.employeeTimeLog.findMany({
    where: { logDate: { gte: periodStart, lt: periodEnd } },
    select: { idUser: true },
    distinct: ['idUser'],
  });
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { OR: [{ status: null }, { status: false }], idRole: { in: [1, 2, 3] } },
        { idUser: { in: worked.map((w) => w.idUser) } },
      ],
    },
    select: { idUser: true, name: true, lastname: true },
    orderBy: [{ name: 'asc' }, { lastname: 'asc' }],
  });
  const histories = await payScheduleHistories(users.map((u) => u.idUser));
  return users.filter((u) => scheduleOn(histories.get(u.idUser) ?? [], periodStart) === group);
}

/** The `group` query param: which payroll (remote unless asked for In House). */
const groupParam = (value: string | null): PaySchedule | null =>
  value == null ? 'remote' : (PAY_SCHEDULES as readonly string[]).includes(value) ? (value as PaySchedule) : null;

/** A period can be approved once it is over: from the next week's first day (Pacific). */
function periodHasEnded(periodEnd: Date): boolean {
  return getTodayRangePST().todayStart.getTime() >= periodEnd.getTime();
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
    const group = groupParam(searchParams.get('group'));
    if (!group) {
      return NextResponse.json({ error: 'Invalid group' }, { status: 400 });
    }
    const day = parsed.data.week ? parseDateParam(parsed.data.week) : getTodayRangePST().todayStart;
    const periodStart = weekStart(group, day);
    const periodEnd = getPayPeriodEnd(periodStart);
    const periodInfo = {
      group,
      periodStart: isoDate(periodStart),
      // Last workday: Thursday for remote, Friday for In House.
      periodEnd: isoDate(lastWorkDay(group, periodStart)),
      periodEnded: periodHasEnded(periodEnd),
    };

    const run = await prisma.payRun.findUnique({
      where: { periodStart },
      include: { statements: { orderBy: { employeeName: 'asc' } } },
    });

    // A voided run no longer describes what will be paid; show live numbers
    // (the period is editable again) and keep the run's status for the badge.
    if (run && run.status !== 'void') {
      return NextResponse.json({
        isLive: false,
        run: {
          id: run.idPayRun,
          ...periodInfo,
          status: run.status,
          scheduledPayDate: run.scheduledPayDate ? isoDate(run.scheduledPayDate) : null,
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
          paidDate: s.paidDate ? isoDate(s.paidDate) : null,
        })),
      });
    }

    const employees = await payrollEmployees(periodStart, periodEnd, group);
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
        id: run?.idPayRun ?? null,
        ...periodInfo,
        status: run?.status ?? null,
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

function statementLines(amounts: PayStatementAmounts) {
  const lines: { kind: string; category: string | null; label: string; quantity: number | null; rate: number | null; amount: number }[] = [
    { kind: 'regular', category: null, label: 'Regular', quantity: amounts.regularHours, rate: amounts.payRate, amount: amounts.regularPay },
  ];
  if (amounts.overtimeHours > 0) {
    lines.push({ kind: 'overtime', category: null, label: 'Overtime', quantity: amounts.overtimeHours, rate: amounts.otPayRate, amount: amounts.overtimePay });
  }
  for (const key of BONUS_FIELDS) {
    const amount = amounts.bonusAmounts[key];
    if (amount > 0) {
      const quantity = isCountedBonus(key) ? (amounts.bonusCounts?.[key] ?? null) : null;
      lines.push({ kind: 'bonus', category: key, label: BONUS_FIELD_LABELS[key], quantity, rate: null, amount });
    }
  }
  return lines;
}

/** Approve (or re-approve) a pay period: snapshots every employee on the
 *  period's payroll into PayStatements that stop tracking live edits from
 *  this point on. Only an administrator can approve payroll. */
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

    const { period, group, scheduledPayDate, notes } = parsed.data;
    const periodStart = weekStart(group, parseDateParam(period));
    const periodEnd = getPayPeriodEnd(periodStart);

    // Approving locks the period. Done mid-week, the snapshot would miss the
    // rest of the week's punches and lock out disconnect/reconnect while
    // people are still working.
    if (!periodHasEnded(periodEnd)) {
      return NextResponse.json(
        { error: `This pay period runs through ${isoDate(lastWorkDay(group, periodStart))}. It can be approved starting ${isoDate(periodEnd)}.` },
        { status: 409 }
      );
    }

    const scheduledDate = scheduledPayDate ? parseDateParam(scheduledPayDate) : null;

    // Compute every statement first (reads only), then write everything in
    // one transaction, so a failure part-way can't leave an approved — and
    // therefore locked — period with only some employees snapshotted.
    const employees = await payrollEmployees(periodStart, periodEnd, group);
    const computed = await Promise.all(
      employees.map(async (emp) => ({ emp, amounts: await computePayStatement(emp.idUser, periodStart) })),
    );

    const ALREADY_PAID = 'ALREADY_PAID';
    let runId: number;
    try {
      runId = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.payRun.findUnique({
            where: { periodStart },
            select: { idPayRun: true, status: true },
          });
          if (existing?.status === 'paid') throw new Error(ALREADY_PAID);

          const runData = {
            status: 'approved',
            scheduledPayDate: scheduledDate,
            notes: notes || null,
            approvedBy: String(adminUserId),
            approvedAt: new Date(),
            voidedBy: null,
            voidedAt: null,
            voidReason: null,
          };
          const run = existing
            ? await tx.payRun.update({ where: { idPayRun: existing.idPayRun }, data: runData })
            : await tx.payRun.create({ data: { periodStart, periodEnd, ...runData } });

          // Someone dropped off this period's payroll since the last approval
          // (deactivated, no hours): their unpaid statement must not stay payable.
          await tx.payStatement.updateMany({
            where: {
              idPayRun: run.idPayRun,
              status: { not: 'paid' },
              idUser: { notIn: employees.map((e) => e.idUser) },
            },
            data: { status: 'void' },
          });

          for (const { emp, amounts } of computed) {
            const statementData = {
              employeeName: `${emp.name ?? ''} ${emp.lastname ?? ''}`.trim(),
              regularHours: amounts.regularHours,
              overtimeHours: amounts.overtimeHours,
              payRate: amounts.payRate,
              otPayRate: amounts.otPayRate,
              regularPay: amounts.regularPay,
              overtimePay: amounts.overtimePay,
              bonusTotal: amounts.bonusTotal,
              grossPay: amounts.grossPay,
              // The week's note as it was when approved.
              snapshotJson: JSON.stringify({ notes: amounts.notes ?? null }),
              status: 'pending',
            };

            // Scoped to status != 'paid': a statement already marked paid is
            // never overwritten, whatever happened since the last approval.
            const updated = await tx.payStatement.updateMany({
              where: { idPayRun: run.idPayRun, idUser: emp.idUser, status: { not: 'paid' } },
              data: statementData,
            });

            const current = await tx.payStatement.findUnique({
              where: { idPayRun_idUser: { idPayRun: run.idPayRun, idUser: emp.idUser } },
              select: { idStatement: true },
            });
            let statementId: number;
            if (updated.count > 0 && current) {
              statementId = current.idStatement;
            } else if (current) {
              continue; // already paid — leave it and its lines alone
            } else {
              const created = await tx.payStatement.create({
                data: { idPayRun: run.idPayRun, idUser: emp.idUser, ...statementData },
              });
              statementId = created.idStatement;
            }

            await tx.payStatementLine.deleteMany({ where: { idStatement: statementId } });
            await tx.payStatementLine.createMany({
              data: statementLines(amounts).map((l) => ({ ...l, idStatement: statementId })),
            });
          }

          return run.idPayRun;
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
    } catch (err) {
      if (err instanceof Error && err.message === ALREADY_PAID) {
        return NextResponse.json(
          { error: 'This pay run has already been paid and cannot be re-approved.' },
          { status: 409 }
        );
      }
      // Two approvals of a brand-new period at the same moment: the second
      // hits the unique PeriodStart index.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'This period was just approved by someone else. Refresh and try again.' },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({ success: true, runId });
  } catch (error) {
    console.error('Payroll runs POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
