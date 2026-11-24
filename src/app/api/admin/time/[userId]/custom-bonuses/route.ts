import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { parseDateParam } from '@/lib/time';
import { resolveUserPeriod, userPeriodContaining } from '@/lib/payroll/pay-schedule-db';
import { isPeriodLocked } from '@/lib/payroll/compute';
import {
  CUSTOM_BONUS_NAME_MAX,
  CUSTOM_BONUS_STARTER_NAMES,
  customBonusRuleError,
  normalizeBonusName,
} from '@/lib/payroll/constants';

type Params = { params: Promise<{ userId: string }> };

/** How many past names the name box offers. */
const SUGGESTION_LIMIT = 20;

const bonusSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Period must be YYYY-MM-DD'),
  name: z
    .string()
    .transform(normalizeBonusName)
    .pipe(z.string().min(1, 'Name is required').max(CUSTOM_BONUS_NAME_MAX, `Name can be up to ${CUSTOM_BONUS_NAME_MAX} characters`)),
  amount: z
    .number()
    .positive('Amount must be more than 0')
    .max(99999.99)
    // Float-tolerant: 0.1 * 100 is 10.000000000000002 in JavaScript.
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'At most 2 decimals'),
});

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

/**
 * One employee's custom bonuses for a pay period, plus the names payroll has
 * used before (most used first) so the same bonus is spelled the same way.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const g = await guard(params);
    if (g.error) return g.error;

    const parsed = clockWeekSchema.safeParse({ week: new URL(request.url).searchParams.get('week') || undefined });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid week parameter' }, { status: 400 });
    }
    const { start: periodStart } = await resolveUserPeriod(g.userId, parsed.data.week);

    const [rows, used] = await Promise.all([
      prisma.payrollCustomBonus.findMany({
        where: { idUser: g.userId, periodStart },
        orderBy: { idCustomBonus: 'asc' },
      }),
      prisma.payrollCustomBonus.groupBy({
        by: ['name'],
        _count: { name: true },
        orderBy: { _count: { name: 'desc' } },
        take: SUGGESTION_LIMIT,
      }),
    ]);

    // Past names first; the starter names fill in until payroll has its own.
    const suggestions: string[] = [];
    for (const name of [...used.map((u) => u.name), ...CUSTOM_BONUS_STARTER_NAMES]) {
      if (!suggestions.some((s) => s.toLowerCase() === name.toLowerCase())) suggestions.push(name);
    }

    return NextResponse.json({
      bonuses: rows.map((r) => ({ id: r.idCustomBonus, name: r.name, amount: Number(r.amount) })),
      suggestions,
    });
  } catch (error) {
    console.error('GET custom-bonuses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Adds one custom bonus to the pay period `period` falls in. */
export async function POST(request: Request, { params }: Params) {
  try {
    const g = await guard(params);
    if (g.error) return g.error;

    const parsed = bonusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { period, name, amount } = parsed.data;

    const day = parseDateParam(period);
    if (isNaN(day.getTime())) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }
    const { start: periodStart } = await userPeriodContaining(g.userId, day);
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

    // Check the rules and insert together, so two quick clicks can't both pass.
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.payrollCustomBonus.findMany({
        where: { idUser: g.userId, periodStart },
        select: { name: true },
      });
      const ruleError = customBonusRuleError(name, existing.map((e) => e.name));
      if (ruleError) return { ruleError };
      const created = await tx.payrollCustomBonus.create({
        data: { idUser: g.userId, periodStart, name, amount, modifiedBy: String(g.adminUserId) },
      });
      return { created };
    }, { isolationLevel: 'Serializable' });

    if ('ruleError' in result) {
      return NextResponse.json({ error: result.ruleError }, { status: 409 });
    }
    return NextResponse.json({ data: { id: result.created.idCustomBonus } }, { status: 201 });
  } catch (error) {
    console.error('POST custom-bonuses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
