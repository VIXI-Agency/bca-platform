import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTodayRangePST, getPayPeriodStart } from '@/lib/time';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { todayStart } = getTodayRangePST();
    const currentPeriodStart = getPayPeriodStart(todayStart);

    // Generate pay period start dates (Fridays) for the last ~24 months.
    // periodStart/endDate are UTC-midnight instants — use the UTC getters/setters
    // and format with timeZone: 'UTC' throughout, so the label doesn't shift by a
    // day on a server whose local timezone isn't UTC (a UTC-midnight timestamp
    // falls in the *previous* local calendar day west of Greenwich).
    const weeks: { date: string; label: string }[] = [];
    const maxWeeks = 24 * 4.33; // Approximately 24 months of weeks (~104 weeks)
    const tempDate = new Date(currentPeriodStart);

    for (let i = 0; i < Math.ceil(maxWeeks); i++) {
      const dateStr = tempDate.toISOString().split('T')[0];
      const endDate = new Date(tempDate);
      endDate.setUTCDate(endDate.getUTCDate() + 6); // Friday + 6 = Thursday
      const label = `${tempDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
      weeks.push({ date: dateStr, label });
      tempDate.setUTCDate(tempDate.getUTCDate() - 7);
    }

    return NextResponse.json({ data: weeks });
  } catch (error) {
    console.error('Clock weeks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
