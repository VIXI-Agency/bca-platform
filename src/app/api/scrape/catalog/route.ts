import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/scrape-admin';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const [industries, cities, yields] = await Promise.all([
      prisma.scrapeIndustry.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.scrapeCity.groupBy({ by: ['state', 'timeZone'], _count: { _all: true } }),
      // Answers "which industries stopped producing", which is the only basis
      // for retiring one. Nothing else in the model records per-industry yield.
      prisma.scrapeTask.groupBy({
        by: ['industry'],
        where: { status: 'done' },
        _count: { _all: true },
        _sum: { importedCount: true },
      }),
    ]);

    const yieldByIndustry = new Map(
      yields.map((y) => [y.industry, { searches: y._count._all, imported: y._sum.importedCount ?? 0 }]),
    );

    return NextResponse.json({
      industries: industries.map((i) => ({
        name: i.name,
        ...(yieldByIndustry.get(i.name) ?? { searches: 0, imported: 0 }),
      })),
      states: cities
        .map((c) => ({ state: c.state.trim(), timeZone: c.timeZone, cities: c._count._all }))
        .sort((a, b) => a.state.localeCompare(b.state)),
    });
  } catch (error) {
    console.error('GET /api/scrape/catalog error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
