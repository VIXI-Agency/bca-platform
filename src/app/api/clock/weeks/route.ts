import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTodayRangePST } from '@/lib/time';
import { payScheduleHistory } from '@/lib/payroll/pay-schedule-db';
import { periodOptions } from '@/lib/payroll/pay-schedule';

/** About 24 months of weekly pay periods. */
const WEEKS_SHOWN = 104;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The signed-in employee's own pay periods, newest first: Fri–Thu for
    // remote, Mon–Fri for In House (see src/lib/payroll/pay-schedule.ts).
    const userId = (session.user as { userId: number }).userId;
    const { todayStart } = getTodayRangePST();
    const weeks = periodOptions(await payScheduleHistory(userId), WEEKS_SHOWN, todayStart).map((o) => ({
      date: o.value,
      label: o.label,
    }));

    return NextResponse.json({ data: weeks });
  } catch (error) {
    console.error('Clock weeks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
