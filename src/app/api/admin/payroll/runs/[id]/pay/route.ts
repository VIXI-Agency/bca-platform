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
    const alreadyPaid = statements.find((s) => s.status === 'paid');
    if (alreadyPaid) {
      return NextResponse.json({ error: `${alreadyPaid.employeeName} is already marked paid` }, { status: 409 });
    }

    const parts = paidDate.split('-').map(Number);
    const paidDateValue = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    await prisma.payStatement.updateMany({
      where: { idStatement: { in: statementIds } },
      data: {
        status: 'paid',
        paymentMethod,
        paymentReference: paymentReference || null,
        paidDate: paidDateValue,
      },
    });

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
