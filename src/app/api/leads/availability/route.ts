import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NEW_LEAD_STATUS } from '@/lib/leads';

/**
 * What is actually callable, sliced the way an agent picks work.
 *
 * /api/calls/next-lead filters by time zone AND industry, so an agent's pool is
 * one cell of that grid, never the headline total. With 159 industries across 5
 * zones, "there are a million leads" and "I have nothing to call" are both true
 * at once, which is the argument this endpoint exists to settle.
 */

/** Industries listed by name before the remainder is collapsed into one row. */
const TOP_INDUSTRIES = 25;

type Counted = { label: string; total: number };

function sortDesc(rows: Counted[]): Counted[] {
  return [...rows].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requested = request.nextUrl.searchParams.get('timezone');
    // Empty string and "all" both mean every zone; only a real value narrows.
    const timeZone = requested && requested !== 'all' ? requested : null;

    const where = {
      idStatus: NEW_LEAD_STATUS,
      ...(timeZone ? { timeZone } : {}),
    };

    // Both grouped counts ride existing indexes — IX_Businesses_Status_TimeZone
    // and IX_Businesses_Status_Industry were created for exactly this shape, and
    // each returns in well under a second against 1.4M available rows.
    const [zoneRows, industryRows] = await Promise.all([
      prisma.business.groupBy({
        by: ['timeZone'],
        where: { idStatus: NEW_LEAD_STATUS },
        _count: { _all: true },
      }),
      prisma.business.groupBy({
        by: ['industry'],
        where,
        _count: { _all: true },
      }),
    ]);

    // Rows with no industry are counted but never listed. Every name here is
    // offered to the agent as a filter to switch to, and next-lead matches
    // Industry literally, so a placeholder label would send them to a filter
    // that can only come back empty again.
    const unspecified = industryRows
      .filter((row) => !row.industry)
      .reduce((sum, row) => sum + row._count._all, 0);

    // 159 industries is small enough to rank in memory, and doing so keeps the
    // remainder exact instead of "everything the database did not return".
    const industries = sortDesc(
      industryRows
        .filter((row) => Boolean(row.industry))
        .map((row) => ({ label: row.industry as string, total: row._count._all })),
    );

    const named = industries.slice(0, TOP_INDUSTRIES);
    const rest = industries.slice(TOP_INDUSTRIES);

    const byZone = sortDesc(
      zoneRows.map((row) => ({ label: row.timeZone ?? 'Unspecified', total: row._count._all })),
    );

    return NextResponse.json({
      timeZone,
      total: byZone.reduce((sum, row) => sum + row.total, 0),
      scopedTotal: industries.reduce((sum, row) => sum + row.total, 0) + unspecified,
      unspecified,
      byZone,
      industries: named,
      otherIndustries: rest.length
        ? { count: rest.length, total: rest.reduce((sum, row) => sum + row.total, 0) }
        : null,
      emptyIndustries: industries.filter((row) => row.total === 0).length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/leads/availability error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
