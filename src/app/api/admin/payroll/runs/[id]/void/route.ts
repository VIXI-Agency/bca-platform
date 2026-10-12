import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { payRunVoidSchema } from '@/lib/validators';

/** Voids an approved-but-not-yet-paid run, unlocking that period's hours,
 *  bonuses and disconnections for editing again. Refused once any statement
 *  in the run has been paid — a paid record is never voided this way. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as { role: number }).role;
    const adminUserId = (session.user as { userId: number }).userId;
    if (role !== 1) {
      return NextResponse.json({ error: 'Only an administrator can void a pay run' }, { status: 403 });
    }

    const { id } = await params;
    const runId = parseInt(id, 10);
    if (isNaN(runId) || runId <= 0) {
      return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = payRunVoidSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const run = await prisma.payRun.findUnique({
      where: { idPayRun: runId },
      include: { statements: { select: { idStatement: true, status: true } } },
    });
    if (!run) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }
    if (run.status === 'paid') {
      return NextResponse.json({ error: 'A paid pay run cannot be voided' }, { status: 409 });
    }
    if (run.statements.some((s) => s.status === 'paid')) {
      return NextResponse.json(
        { error: 'Some employees in this run are already marked paid — it cannot be voided as a whole.' },
        { status: 409 }
      );
    }

    await prisma.$transaction([
      prisma.payRun.update({
        where: { idPayRun: runId },
        data: {
          status: 'void',
          voidedBy: String(adminUserId),
          voidedAt: new Date(),
          voidReason: parsed.data.reason,
        },
      }),
      prisma.payStatement.updateMany({
        where: { idPayRun: runId },
        data: { status: 'void' },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Payroll void POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
