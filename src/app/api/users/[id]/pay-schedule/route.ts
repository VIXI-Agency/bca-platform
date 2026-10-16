import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { addDaysUTC, getTodayRangePST, parseDateParam } from '@/lib/time';
import { payScheduleHistory } from '@/lib/payroll/pay-schedule-db';
import {
  PAY_SCHEDULES,
  PAY_SCHEDULE_LABELS,
  effectiveFromError,
  periodContaining,
  periodLabel,
  scheduleOn,
} from '@/lib/payroll/pay-schedule';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const changeSchema = z.object({ schedule: z.enum(PAY_SCHEDULES), effectiveFrom: isoDate });

type Params = { params: Promise<{ id: string }> };

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
 * A change on `effectiveFrom` reshapes the week it cuts short and every week
 * after it, so it can't touch an employee whose statement in one of those
 * weeks is already approved or paid.
 */
async function rewritesApprovedPay(idUser: number, effectiveFrom: Date): Promise<boolean> {
  const weekBefore = addDaysUTC(effectiveFrom, -7);
  const count = await prisma.payStatement.count({
    where: {
      idUser,
      status: { not: 'void' },
      payRun: { status: { in: ['approved', 'paid'] }, periodStart: { gt: weekBefore } },
    },
  });
  return count > 0;
}

const LOCKED = 'This would change a pay week that is already approved or paid. Void that payroll first.';

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
    const { schedule } = parsed.data;
    const effectiveFrom = parseDateParam(parsed.data.effectiveFrom);
    if (effectiveFrom.toISOString().slice(0, 10) !== parsed.data.effectiveFrom) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const dayError = effectiveFromError(schedule, effectiveFrom);
    if (dayError) return NextResponse.json({ error: dayError }, { status: 400 });

    const history = await payScheduleHistory(g.idUser);
    const previous = history.filter((c) => c.effectiveFrom.getTime() !== effectiveFrom.getTime());
    if (scheduleOn(previous, addDaysUTC(effectiveFrom, -1)) === schedule) {
      return NextResponse.json(
        { error: `Already ${PAY_SCHEDULE_LABELS[schedule]} before that date.` },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { idUser: g.idUser }, select: { idUser: true } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (await rewritesApprovedPay(g.idUser, effectiveFrom)) {
      return NextResponse.json({ error: LOCKED }, { status: 409 });
    }

    const data = { schedule, changedBy: String(g.adminUserId), changedAt: new Date() };
    await prisma.userPaySchedule.upsert({
      where: { idUser_effectiveFrom: { idUser: g.idUser, effectiveFrom } },
      create: { idUser: g.idUser, effectiveFrom, ...data },
      update: data,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
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

    if (await rewritesApprovedPay(g.idUser, effectiveFrom)) {
      return NextResponse.json({ error: LOCKED }, { status: 409 });
    }
    const { count } = await prisma.userPaySchedule.deleteMany({ where: { idUser: g.idUser, effectiveFrom } });
    if (count === 0) return NextResponse.json({ error: 'Change not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE pay-schedule error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
