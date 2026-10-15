import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { getPayPeriodStart, getTodayRangePST, resolvePayPeriodStart } from '@/lib/time';
import { isPeriodLocked } from '@/lib/payroll/compute';
import { DATED_BONUS_CATEGORIES, datedBonusRuleError } from '@/lib/payroll/constants';
import { dayFromString } from '@/lib/admin-time/disconnections';

type Params = { params: Promise<{ userId: string }> };

const entrySchema = z.object({
  category: z.enum(DATED_BONUS_CATEGORIES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  amount: z
    .number()
    .positive('Amount must be more than 0')
    .max(99999.99)
    // Float-tolerant: 0.1 * 100 is 10.000000000000002 in JavaScript.
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'At most 2 decimals'),
});

const isoDay = (d: Date) => d.toISOString().split('T')[0];

async function guard(params: Params['params']) {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { role, userId: adminUserId } = session.user as { role: number; userId: number };
  if (role !== 1) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  const userId = parseInt((await params).userId, 10);
  if (isNaN(userId) || userId <= 0) {
    return { error: NextResponse.json({ error: 'Invalid userId' }, { status: 400 }) };
  }
  return { userId, adminUserId };
}

/** The dated bonuses (Wheel Spins, CCF Spiffs) of one employee's pay period. */
export async function GET(request: Request, { params }: Params) {
  try {
    const g = await guard(params);
    if ('error' in g) return g.error;

    const parsed = clockWeekSchema.safeParse({ week: new URL(request.url).searchParams.get('week') || undefined });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid week parameter' }, { status: 400 });
    }
    const periodStart = resolvePayPeriodStart(parsed.data.week);

    const rows = await prisma.payrollBonusEntry.findMany({
      where: { idUser: g.userId, periodStart },
      orderBy: [{ entryDate: 'asc' }, { idEntry: 'asc' }],
    });

    return NextResponse.json({
      entries: rows.map((r) => ({ id: r.idEntry, category: r.category, date: isoDay(r.entryDate), amount: Number(r.amount) })),
    });
  } catch (error) {
    console.error('GET bonus-entries error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Adds one dated bonus. The pay period is the one the date falls in; the
 * date must be a workday that has already happened, and the category's
 * caps (DATED_BONUS_RULES) are checked against the period's entries.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const g = await guard(params);
    if ('error' in g) return g.error;

    const parsed = entrySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { category, date, amount } = parsed.data;

    const day = dayFromString(date);
    if (isNaN(day.getTime()) || isoDay(day) !== date) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      return NextResponse.json({ error: 'Bonuses are earned on workdays (Monday to Friday).' }, { status: 400 });
    }
    if (day.getTime() > getTodayRangePST().todayStart.getTime()) {
      return NextResponse.json({ error: 'A bonus can’t be added for a future day.' }, { status: 400 });
    }

    const periodStart = getPayPeriodStart(day);
    if (await isPeriodLocked(periodStart)) {
      return NextResponse.json(
        { error: 'This pay period has been approved or paid and can no longer be edited.' },
        { status: 409 },
      );
    }

    const employee = await prisma.user.findUnique({ where: { idUser: g.userId }, select: { idUser: true } });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Check the caps and insert together, so two quick clicks can't both pass.
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.payrollBonusEntry.findMany({
        where: { idUser: g.userId, periodStart },
        select: { category: true, entryDate: true },
      });
      const ruleError = datedBonusRuleError(
        category,
        date,
        existing.map((e) => ({ category: e.category, entryDate: isoDay(e.entryDate) })),
      );
      if (ruleError) return { ruleError };
      const created = await tx.payrollBonusEntry.create({
        data: { idUser: g.userId, periodStart, category, entryDate: day, amount, modifiedBy: String(g.adminUserId) },
      });
      return { created };
    }, { isolationLevel: 'Serializable' });

    if ('ruleError' in result) {
      return NextResponse.json({ error: result.ruleError }, { status: 409 });
    }
    return NextResponse.json({ data: { id: result.created.idEntry } }, { status: 201 });
  } catch (error) {
    console.error('POST bonus-entries error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
