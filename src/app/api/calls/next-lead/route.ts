import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getNextLeadSchema } from '@/lib/validators';

/**
 * How long a lead may sit "On Call" before it is treated as abandoned.
 *
 * Long enough to cover a real call plus the notes an agent types afterwards,
 * short enough that a lead lost to a closed tab is back in the pool the same
 * shift. A lead released while its agent is still on it is not lost work:
 * /api/calls/log sets the status by IdBusiness and does not require the lead to
 * still be On Call.
 */
const ON_CALL_EXPIRY_MINUTES = 30;

/** Ceiling on rows released per request, so this never becomes a long write. */
const RECLAIM_BATCH = 500;

interface LeadRow {
  IdBusiness: number;
  BusinessName: string | null;
  Phone: string | null;
  Address: string | null;
  Location: string | null;
  Industry: string | null;
  TimeZone: string | null;
  IdStatus: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = getNextLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { industry, timezone } = parsed.data;

    // Return abandoned leads to the pool before serving a new one.
    //
    // Handing a lead out sets IdStatus = 1 immediately, and until this existed
    // nothing ever set it back: an agent who closed the tab, lost connection or
    // simply asked for a different lead parked that row forever. By 2026-08-07
    // 301,133 leads had been handed out and never called even once.
    //
    // Done here rather than on a schedule because this route is the only place
    // that consumes the pool, so it is the one place guaranteed to run whenever
    // the pool matters. TOP bounds the write so a large backlog costs the agent
    // waiting on this request a few milliseconds, not a table-wide lock.
    //
    // OnCallSince IS NOT NULL excludes the rows that predate the column: those
    // carry a call record and releasing them means dialling somebody twice.
    await prisma.$executeRaw`
      UPDATE TOP (${RECLAIM_BATCH}) Businesses
      SET IdStatus = 3, OnCallSince = NULL
      WHERE IdStatus = 1
        AND OnCallSince IS NOT NULL
        AND OnCallSince < DATEADD(minute, ${-ON_CALL_EXPIRY_MINUTES}, SYSUTCDATETIME())
    `;

    // Build WHERE conditions for parameterized query
    const conditions: Prisma.Sql[] = [Prisma.sql`IdStatus = 3`];

    if (timezone) {
      conditions.push(Prisma.sql`TimeZone = ${timezone}`);
    }

    if (industry && industry !== 'Random Industry') {
      conditions.push(Prisma.sql`Industry = ${industry}`);
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    // Atomic SELECT+UPDATE using CTE with UPDLOCK+READPAST:
    // - Get approximate count of matching rows, pick a random offset
    // - Use OFFSET/FETCH to jump directly to a random row (avoids full NEWID() sort)
    // - UPDLOCK: exclusively locks the selected row
    // - READPAST: other transactions skip already-locked rows
    const countResult = await prisma.$queryRaw<{ cnt: number }[]>(
      Prisma.sql`SELECT COUNT(*) as cnt FROM Businesses WHERE ${whereClause}`
    );
    const totalAvailable = Number(countResult[0]?.cnt ?? 0);

    if (totalAvailable === 0) {
      return NextResponse.json({ error: 'No leads available' }, { status: 404 });
    }

    const randomOffset = Math.floor(Math.random() * totalAvailable);

    const rows = await prisma.$queryRaw<LeadRow[]>(
      Prisma.sql`
        ;WITH cte AS (
          SELECT *
          FROM Businesses WITH (UPDLOCK, READPAST)
          WHERE ${whereClause}
          ORDER BY IdBusiness
          OFFSET ${randomOffset} ROWS FETCH NEXT 1 ROWS ONLY
        )
        UPDATE cte
        SET IdStatus = 1, OnCallSince = SYSUTCDATETIME()
        OUTPUT
          inserted.IdBusiness,
          inserted.BusinessName,
          inserted.Phone,
          inserted.Address,
          inserted.Location,
          inserted.Industry,
          inserted.TimeZone,
          inserted.IdStatus
      `
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No leads available' }, { status: 404 });
    }

    const biz = rows[0];

    // Transform to match frontend LeadBusiness interface
    return NextResponse.json({
      idBusiness: biz.IdBusiness,
      businessName: biz.BusinessName ?? '',
      phone: biz.Phone ?? '',
      address: biz.Address ?? '',
      location: biz.Location ?? '',
      industry: biz.Industry ?? '',
      timezone: biz.TimeZone ?? '',
      idStatus: biz.IdStatus ?? 0,
    });
  } catch (error) {
    console.error('POST /api/calls/next-lead error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
