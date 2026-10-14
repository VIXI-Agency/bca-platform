import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { payStatementPaySchema } from '@/lib/validators';
import { parseDateParam } from '@/lib/time';

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

    const paidDateValue = parseDateParam(paidDate);

    // Everything below runs in one transaction and every write is scoped to
    // the status it expects, so a concurrent void, re-approval or second
    // "mark paid" can't be overwritten:
    // - statements flip only from 'pending'; if fewer rows match than were
    //   requested, something changed underneath us and the whole batch rolls
    //   back rather than leaving a partial payment next to a 409;
    // - the run flips to 'paid' only from 'approved', and only once no
    //   pending statement is left.
    const STATEMENTS_CHANGED = 'STATEMENTS_CHANGED';
    let runFullyPaid: boolean;
    try {
      runFullyPaid = await prisma.$transaction(async (tx) => {
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

        const stillPending = await tx.payStatement.count({ where: { idPayRun: runId, status: 'pending' } });
        if (stillPending > 0) return false;

        const flipped = await tx.payRun.updateMany({
          where: { idPayRun: runId, status: 'approved' },
          data: { status: 'paid', paidAt: new Date() },
        });
        return flipped.count > 0;
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

    return NextResponse.json({ success: true, runFullyPaid });
  } catch (error) {
    console.error('Payroll pay POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
