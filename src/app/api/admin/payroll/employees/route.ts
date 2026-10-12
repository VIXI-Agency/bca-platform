import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Distinct employees who have at least one pay statement — powers the
 *  Payment History filter. Deliberately not limited to currently-active
 *  employees (unlike /api/admin/time/employees, which is Administrator-only
 *  and scoped to active staff for editing hours): a terminated employee's
 *  past payments should stay filterable here. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as { role: number }).role;
    if (role !== 1 && role !== 2) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await prisma.payStatement.findMany({
      distinct: ['idUser'],
      select: { idUser: true, employeeName: true },
      orderBy: { employeeName: 'asc' },
    });

    return NextResponse.json({ data: rows.map((r) => ({ userId: r.idUser, name: r.employeeName })) });
  } catch (error) {
    console.error('Payroll employees GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
