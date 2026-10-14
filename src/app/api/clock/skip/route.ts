import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nowPstAsUtc, getTodayRangePST } from '@/lib/time';
import { z } from 'zod';

const skipBreakSchema = z.object({
  breakType: z.enum(['firstBreak', 'lunch', 'secondBreak']),
});

// Maps break type to the out/in field names
const BREAK_FIELDS: Record<string, { out: string; in: string; previousRequired: string }> = {
  firstBreak: { out: 'firstBreakOut', in: 'firstBreakIn', previousRequired: 'clockIn' },
  lunch: { out: 'lunchOut', in: 'lunchIn', previousRequired: 'firstBreakIn' },
  secondBreak: { out: 'secondBreakOut', in: 'secondBreakIn', previousRequired: 'lunchIn' },
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;

    // Check if user is part-time; the session outlives a deactivation, so
    // check the account is still active too.
    const user = await prisma.user.findUnique({
      where: { idUser: userId },
      select: { isPartTime: true, status: true },
    });
    if (!user || user.status === true) {
      return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = skipBreakSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid break type', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { breakType } = parsed.data;

    // Breaks (first/second) can only be skipped by part-time employees; lunch can be skipped by anyone
    if (breakType !== 'lunch' && !user?.isPartTime) {
      return NextResponse.json(
        { error: 'Only part-time employees can skip breaks' },
        { status: 403 }
      );
    }
    const fields = BREAK_FIELDS[breakType];
    const now = nowPstAsUtc();
    const { todayStart, todayEnd } = getTodayRangePST();

    // Find today's time log
    const log = await prisma.employeeTimeLog.findFirst({
      where: {
        idUser: userId,
        logDate: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    if (!log || !log.clockIn) {
      return NextResponse.json({ error: 'Must clock in first' }, { status: 400 });
    }

    if (log.clockOut) {
      return NextResponse.json({ error: 'Already clocked out for the day' }, { status: 400 });
    }

    // Check if the previous required field is filled
    const previousValue = log[fields.previousRequired as keyof typeof log];
    if (!previousValue) {
      return NextResponse.json(
        { error: `Cannot skip ${breakType}. Must complete ${fields.previousRequired} first.` },
        { status: 400 }
      );
    }

    // Check if break is already recorded
    const outValue = log[fields.out as keyof typeof log];
    if (outValue) {
      return NextResponse.json(
        { error: `${breakType} already recorded` },
        { status: 400 }
      );
    }

    // Set both out and in to current time (0-duration break)
    const updated = await prisma.employeeTimeLog.update({
      where: { timeLogId: log.timeLogId },
      data: {
        [fields.out]: now,
        [fields.in]: now,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Clock skip error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
