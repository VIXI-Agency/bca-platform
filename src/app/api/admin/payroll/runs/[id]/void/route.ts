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

    // The existence/status checks and the write all happen inside one
    // transaction, re-reading current state right before writing — a
    // concurrent "mark paid" landing between a separate check and write
    // (as a split findUnique + $transaction([...]) would allow) could
    // otherwise still slip a statement to 'paid' a moment after we decided
    // it was safe to void.
    const NOT_FOUND = 'NOT_FOUND';
    const ALREADY_PAID = 'ALREADY_PAID';
    const HAS_PAID_STATEMENTS = 'HAS_PAID_STATEMENTS';
    try {
      await prisma.$transaction(async (tx) => {
        const run = await tx.payRun.findUnique({
          where: { idPayRun: runId },
          include: { statements: { select: { status: true } } },
        });
        if (!run) throw new Error(NOT_FOUND);
        if (run.status === 'paid') throw new Error(ALREADY_PAID);
        if (run.statements.some((s) => s.status === 'paid')) throw new Error(HAS_PAID_STATEMENTS);

        await tx.payRun.update({
          where: { idPayRun: runId },
          data: {
            status: 'void',
            voidedBy: String(adminUserId),
            voidedAt: new Date(),
            voidReason: parsed.data.reason,
          },
        });
        await tx.payStatement.updateMany({
          where: { idPayRun: runId },
          data: { status: 'void' },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === NOT_FOUND) {
        return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
      }
      if (err instanceof Error && err.message === ALREADY_PAID) {
        return NextResponse.json({ error: 'A paid pay run cannot be voided' }, { status: 409 });
      }
      if (err instanceof Error && err.message === HAS_PAID_STATEMENTS) {
        return NextResponse.json(
          { error: 'Some employees in this run are already marked paid — it cannot be voided as a whole.' },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Payroll void POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
