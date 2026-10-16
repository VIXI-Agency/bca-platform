import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema, payrollBonusSchema } from '@/lib/validators';
import { getPayPeriodStart, parseDateParam, resolvePayPeriodStart } from '@/lib/time';
import { isPeriodLocked } from '@/lib/payroll/compute';
import {
  BONUS_COUNT_KEYS,
  COUNTED_BONUS_FIELDS,
  PERIOD_BONUS_FIELDS,
  type BonusCountKey,
  type PeriodBonusField,
} from '@/lib/payroll/constants';

// One typed amount per period. Wheel Spins and CCF Spiffs are dated entries
// (see ./bonus-entries); the legacy WheelSpins column is no longer read.
type BonusAmounts = Record<PeriodBonusField, number | null> & Record<BonusCountKey, number | null>;

const COUNT_KEYS = COUNTED_BONUS_FIELDS.map((key) => BONUS_COUNT_KEYS[key]);

/** Amounts per category, plus how many accounts / verified leads they're for. */
function toResponse(bonus: Record<string, unknown> | null): BonusAmounts {
  return Object.fromEntries([
    ...PERIOD_BONUS_FIELDS.map((key) => [key, bonus?.[key] != null ? Number(bonus[key]) : null]),
    ...COUNT_KEYS.map((key) => [key, bonus?.[key] != null ? Number(bonus[key]) : null]),
  ]) as BonusAmounts;
}

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

    const periodStart = resolvePayPeriodStart(parsed.data.week);

    const bonus = await prisma.payrollBonus.findUnique({
      where: { idUser_periodStart: { idUser: targetUserId, periodStart } },
    });

    return NextResponse.json(toResponse(bonus));
  } catch (error) {
    console.error('Admin time bonus GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    const adminUserId = (session.user as { userId: number }).userId;
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId: userIdStr } = await params;
    const targetUserId = parseInt(userIdStr, 10);
    if (isNaN(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = payrollBonusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { period, ...fields } = parsed.data;
    const periodStart = getPayPeriodStart(parseDateParam(period));

    if (await isPeriodLocked(periodStart)) {
      return NextResponse.json(
        { error: 'This pay period has been approved or paid and can no longer be edited.' },
        { status: 409 }
      );
    }

    const fieldData = Object.fromEntries([
      ...PERIOD_BONUS_FIELDS.map((key) => [key, fields[key] ?? null]),
      ...COUNT_KEYS.map((key) => [key, fields[key] ?? null]),
    ]);

    const bonus = await prisma.payrollBonus.upsert({
      where: { idUser_periodStart: { idUser: targetUserId, periodStart } },
      create: {
        idUser: targetUserId,
        periodStart,
        ...fieldData,
        modifiedBy: String(adminUserId),
      },
      update: {
        ...fieldData,
        modifiedBy: String(adminUserId),
        modifiedAt: new Date(),
      },
    });

    return NextResponse.json(toResponse(bonus));
  } catch (error) {
    console.error('Admin time bonus PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
