import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clockWeekSchema } from '@/lib/validators';
import { getPayPeriodEnd, resolvePayPeriodStart } from '@/lib/time';
import { toAuditDtos, fetchDisconnectionAudits } from '@/lib/admin-time/audit-dto';

/** A pay period's edits across the whole floor stay well under this; it only
 *  bounds a pathological period instead of returning an unbounded list. */
const MAX_AUDITS = 2000;

/**
 * Every manual time edit in a pay period, for all employees (the Audit Log
 * tab's "All Employees" option). Query: week=YYYY-MM-DD (any day of the period).
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as { role: number }).role !== 1) {
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

    const periodStart = resolvePayPeriodStart(parsed.data.week);
    const periodEnd = getPayPeriodEnd(periodStart);

    const [audits, disconnectionAudits] = await Promise.all([
      prisma.employeeTimeLogAudit.findMany({
        where: { modifiedDate: { gte: periodStart, lt: periodEnd } },
        orderBy: { modifiedDate: 'desc' },
        take: MAX_AUDITS,
      }),
      fetchDisconnectionAudits(periodStart, periodEnd),
    ]);

    return NextResponse.json({ audits: await toAuditDtos(audits, disconnectionAudits) });
  } catch (error) {
    console.error('GET /api/admin/time/audits error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
