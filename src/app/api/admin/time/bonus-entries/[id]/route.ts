import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPeriodLocked } from '@/lib/payroll/compute';

/** Removes one dated bonus (e.g. entered for the wrong day or amount). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as { role: number }).role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 });
    }

    const entry = await prisma.payrollBonusEntry.findUnique({ where: { idEntry: id } });
    if (!entry) {
      return NextResponse.json({ error: 'Bonus entry not found' }, { status: 404 });
    }
    if (await isPeriodLocked(entry.periodStart)) {
      return NextResponse.json(
        { error: 'This pay period has been approved or paid and can no longer be edited.' },
        { status: 409 },
      );
    }

    await prisma.payrollBonusEntry.delete({ where: { idEntry: id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE bonus-entries error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
