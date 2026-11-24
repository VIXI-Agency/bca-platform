import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPeriodLocked } from '@/lib/payroll/compute';

/** Removes one custom bonus (e.g. typed with the wrong name or amount). */
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
      return NextResponse.json({ error: 'Invalid bonus id' }, { status: 400 });
    }

    const bonus = await prisma.payrollCustomBonus.findUnique({ where: { idCustomBonus: id } });
    if (!bonus) {
      return NextResponse.json({ error: 'Custom bonus not found' }, { status: 404 });
    }
    if (await isPeriodLocked(bonus.periodStart)) {
      return NextResponse.json(
        { error: 'This pay period has been approved or paid and can no longer be edited.' },
        { status: 409 },
      );
    }

    await prisma.payrollCustomBonus.delete({ where: { idCustomBonus: id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE custom-bonuses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
