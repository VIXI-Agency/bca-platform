import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { addDaysUTC, getTodayRangePST, parseDateParam } from '@/lib/time';
import { PERIOD_BONUS_FIELDS } from '@/lib/payroll/constants';
import { payScheduleHistory } from '@/lib/payroll/pay-schedule-db';
import { affectedFrom, planBonusRefile } from '@/lib/payroll/pay-schedule-change';
import {
  PAY_SCHEDULES,
  PAY_SCHEDULE_LABELS,
  effectiveFromError,
  periodContaining,
  periodLabel,
  scheduleOn,
  type PaySchedule,
  type ScheduleChange,
} from '@/lib/payroll/pay-schedule';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const changeSchema = z.object({ schedule: z.enum(PAY_SCHEDULES), effectiveFrom: isoDate });

type Params = { params: Promise<{ id: string }> };

/** A refusal raised inside the transaction, returned as-is. */
class Refusal extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const LOCKED = 'This would change a pay week that is already approved or paid. Void that payroll first.';

/** Administrators only; returns the target user id or an error response. */
async function guard(params: Params['params']) {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { role, userId: adminUserId } = session.user as { role: number; userId: number };
  if (role !== 1) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const idUser = Number((await params).id);
  if (!Number.isInteger(idUser) || idUser <= 0) {
    return { error: NextResponse.json({ error: 'Invalid user ID' }, { status: 400 }) };
  }
  return { idUser, adminUserId };
}

/**
 * Applies a change in one serializable transaction: refuses it when an
 * approved or paid payroll (either group) falls in the weeks it reshapes —
 * the employee may be in one, or be moving into one snapshotted without
 * them — then writes it and re-files the dated bonuses whose week moved.
 */
async function applyChange(
  idUser: number,
  effectiveFrom: Date,
  newHistory: ScheduleChange[],
  write: (tx: Prisma.TransactionClient) => Promise<unknown>,
) {
  const from = affectedFrom(effectiveFrom);
  await prisma.$transaction(
    async (tx) => {
      const lockedRuns = await tx.payRun.count({
        where: { status: { in: ['approved', 'paid'] }, periodStart: { gte: from } },
      });
      if (lockedRuns > 0) throw new Refusal(LOCKED, 409);

      const [entries, bonuses] = await Promise.all([
        tx.payrollBonusEntry.findMany({
          where: { idUser, entryDate: { gte: from } },
          select: { idEntry: true, category: true, entryDate: true, periodStart: true },
        }),
        tx.payrollBonus.findMany({ where: { idUser, periodStart: { gte: from } } }),
      ]);
      const plan = planBonusRefile(
        newHistory,
        entries,
        bonuses.map((b) => ({
          periodStart: b.periodStart,
          hasAmounts: PERIOD_BONUS_FIELDS.some((key) => Number(b[key] ?? 0) > 0),
        })),
      );
      if (plan.error) throw new Refusal(plan.error, 409);

      await write(tx);
      for (const move of plan.moves) {
        await tx.payrollBonusEntry.update({ where: { idEntry: move.idEntry }, data: { periodStart: move.periodStart } });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** The user's pay week today and every change on record. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const g = await guard(params);
    if ('error' in g) return g.error;

    const history = await payScheduleHistory(g.idUser);
    const { todayStart } = getTodayRangePST();
    return NextResponse.json({
      current: scheduleOn(history, todayStart),
      currentPeriod: periodLabel(periodContaining(history, todayStart)),
      changes: history
        .map((c) => ({ schedule: c.schedule, effectiveFrom: c.effectiveFrom.toISOString().slice(0, 10) }))
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    });
  } catch (error) {
    console.error('GET pay-schedule error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Puts the user on `schedule` from `effectiveFrom` on. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const g = await guard(params);
    if ('error' in g) return g.error;

    const parsed = changeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const schedule: PaySchedule = parsed.data.schedule;
    const effectiveFrom = parseDateParam(parsed.data.effectiveFrom);
    if (effectiveFrom.toISOString().slice(0, 10) !== parsed.data.effectiveFrom) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const dayError = effectiveFromError(schedule, effectiveFrom);
    if (dayError) return NextResponse.json({ error: dayError }, { status: 400 });

    const history = await payScheduleHistory(g.idUser);
    const others = history.filter((c) => c.effectiveFrom.getTime() !== effectiveFrom.getTime());
    if (scheduleOn(others, addDaysUTC(effectiveFrom, -1)) === schedule) {
      return NextResponse.json(
        { error: `Already ${PAY_SCHEDULE_LABELS[schedule]} before that date.` },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { idUser: g.idUser }, select: { idUser: true } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const data = { schedule, changedBy: String(g.adminUserId), changedAt: new Date() };
    await applyChange(g.idUser, effectiveFrom, [...others, { schedule, effectiveFrom }], (tx) =>
      tx.userPaySchedule.upsert({
        where: { idUser_effectiveFrom: { idUser: g.idUser, effectiveFrom } },
        create: { idUser: g.idUser, effectiveFrom, ...data },
        update: data,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('POST pay-schedule error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Cancels the change on `?effectiveFrom=`. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const g = await guard(params);
    if ('error' in g) return g.error;

    const parsed = isoDate.safeParse(request.nextUrl.searchParams.get('effectiveFrom'));
    if (!parsed.success) return NextResponse.json({ error: 'effectiveFrom required (YYYY-MM-DD)' }, { status: 400 });
    const effectiveFrom = parseDateParam(parsed.data);

    const history = await payScheduleHistory(g.idUser);
    const remaining = history.filter((c) => c.effectiveFrom.getTime() !== effectiveFrom.getTime());
    if (remaining.length === history.length) return NextResponse.json({ error: 'Change not found' }, { status: 404 });

    await applyChange(g.idUser, effectiveFrom, remaining, (tx) =>
      tx.userPaySchedule.deleteMany({ where: { idUser: g.idUser, effectiveFrom } }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('DELETE pay-schedule error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
