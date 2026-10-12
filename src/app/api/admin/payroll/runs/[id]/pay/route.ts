import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { payStatementPaySchema } from '@/lib/validators';

/** Marks one or more statements in a run as paid. The run itself flips to
 *  'paid' only once every non-void statement in it is paid — partial
 *  payments are tracked at the statement level in the meantime. */
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
    if (role !== 1) {
      return NextResponse.json({ error: 'Only an administrator can mark payroll as paid' }, { status: 403 });
    }

    const { id } = await params;
    const runId = parseInt(id, 10);
    if (isNaN(runId) || runId <= 0) {
      return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = payStatementPaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { statementIds, paymentMethod, paymentReference, paidDate } = parsed.data;

    const run = await prisma.payRun.findUnique({ where: { idPayRun: runId } });
    if (!run) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }
    if (run.status === 'void') {
      return NextResponse.json({ error: 'This pay run was voided' }, { status: 409 });
    }

    const statements = await prisma.payStatement.findMany({
      where: { idStatement: { in: statementIds }, idPayRun: runId },
    });
    if (statements.length !== statementIds.length) {
      return NextResponse.json({ error: 'One or more statements were not found in this run' }, { status: 404 });
    }

    const parts = paidDate.split('-').map(Number);
    const paidDateValue = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    // Atomic guard: the WHERE's status: 'pending' is checked by the database
    // at write time, not by a find() a moment earlier, so a statement a
    // concurrent request already marked paid can't be silently re-marked by
    // this one. If fewer rows matched than requested, something changed
    // underneath us — roll the whole update back (via the thrown error,
    // inside the transaction) rather than leave a partial paid batch sitting
    // next to a 409 response.
    const STATEMENTS_CHANGED = 'STATEMENTS_CHANGED';
    try {
      await prisma.$transaction(async (tx) => {
        const updateResult = await tx.payStatement.updateMany({
          where: { idStatement: { in: statementIds }, idPayRun: runId, status: 'pending' },
          data: {
            status: 'paid',
            paymentMethod,
            paymentReference: paymentReference || null,
            paidDate: paidDateValue,
          },
        });
        if (updateResult.count !== statementIds.length) {
          throw new Error(STATEMENTS_CHANGED);
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message === STATEMENTS_CHANGED) {
        return NextResponse.json(
          { error: 'One or more statements were already paid or changed by another request — refresh and try again.' },
          { status: 409 }
        );
      }
      throw err;
    }

    const allStatements = await prisma.payStatement.findMany({
      where: { idPayRun: runId },
      select: { status: true },
    });
    const allSettled = allStatements.every((s) => s.status === 'paid' || s.status === 'void');
    if (allSettled) {
      await prisma.payRun.update({
        where: { idPayRun: runId },
        data: { status: 'paid', paidAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, runFullyPaid: allSettled });
  } catch (error) {
    console.error('Payroll pay POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
