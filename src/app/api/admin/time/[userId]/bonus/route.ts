import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema, payrollBonusSchema } from '@/lib/validators';
import { getTodayRangePST, getPayPeriodStart } from '@/lib/time';

function resolvePeriodStart(week: string | null): Date {
  if (week) {
    const parts = week.split('-').map(Number);
    const inputDate = new Date(parts[0], parts[1] - 1, parts[2]);
    return getPayPeriodStart(inputDate);
  }
  const { todayStart } = getTodayRangePST();
  return getPayPeriodStart(todayStart);
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
    if (role !== 1 && role !== 2) {
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

    const periodStart = resolvePeriodStart(parsed.data.week ?? null);

    const bonus = await prisma.payrollBonus.findUnique({
      where: { idUser_periodStart: { idUser: targetUserId, periodStart } },
    });

    return NextResponse.json({
      amount: bonus ? Number(bonus.amount) : null,
      note: bonus?.note ?? null,
    });
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
    if (role !== 1 && role !== 2) {
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

    const { period, amount, note } = parsed.data;
    const parts = period.split('-').map(Number);
    const periodStart = getPayPeriodStart(new Date(parts[0], parts[1] - 1, parts[2]));

    const bonus = await prisma.payrollBonus.upsert({
      where: { idUser_periodStart: { idUser: targetUserId, periodStart } },
      create: {
        idUser: targetUserId,
        periodStart,
        amount,
        note: note || null,
        modifiedBy: String(adminUserId),
      },
      update: {
        amount,
        note: note || null,
        modifiedBy: String(adminUserId),
        modifiedAt: new Date(),
      },
    });

    return NextResponse.json({ amount: Number(bonus.amount), note: bonus.note ?? null });
  } catch (error) {
    console.error('Admin time bonus PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
