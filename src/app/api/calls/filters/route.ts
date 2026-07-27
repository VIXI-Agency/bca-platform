import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timezone = request.nextUrl.searchParams.get('timezone')?.trim() || null;

    // Industries are scoped to the selected timezone (with a live lead count) so the
    // dropdown never offers a timezone+industry combination that yields zero leads.
    // Without a timezone we return none — the UI keeps the industry filter disabled
    // until a timezone is picked (a timezone is required to fetch a lead anyway).
    const industriesPromise = timezone
      ? prisma.$queryRaw<{ industry: string; count: number }[]>(Prisma.sql`
          SELECT Industry as industry, CAST(COUNT(*) AS INT) as count
          FROM dbo.Businesses
          WHERE IdStatus = 3 AND UPPER(TimeZone) = ${timezone.toUpperCase()}
            AND Industry IS NOT NULL AND Industry != ''
          GROUP BY Industry
          ORDER BY Industry
        `)
      : Promise.resolve([] as { industry: string; count: number }[]);

    const [industries, timezones] = await Promise.all([
      industriesPromise,
      prisma.$queryRaw<{ timeZone: string }[]>`
        SELECT DISTINCT UPPER(TimeZone) as timeZone
        FROM dbo.Businesses
        WHERE IdStatus = 3 AND TimeZone IS NOT NULL AND TimeZone != ''
        ORDER BY timeZone
      `,
    ]);

    return NextResponse.json({
      industries: industries.map((i) => ({ name: i.industry, count: Number(i.count) })),
      timezones: timezones.map((t) => t.timeZone),
    }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    console.error('GET /api/calls/filters error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
