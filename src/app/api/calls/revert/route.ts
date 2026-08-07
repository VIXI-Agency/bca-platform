import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;
    const role = (session.user as { role: number }).role;

    const body = await request.json();
    const idBusiness = body?.idBusiness;
    const idCall = body?.idCall;

    if (!idBusiness || typeof idBusiness !== 'number' || !idCall || typeof idCall !== 'number') {
      return NextResponse.json(
        { error: 'idBusiness and idCall are required and must be numbers' },
        { status: 400 },
      );
    }

    // Verify ownership: the call must belong to this user (admins can revert any)
    if (role !== 1) {
      const call = await prisma.call.findUnique({ where: { idCall }, select: { idUser: true } });
      if (!call || call.idUser !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Verify the call belongs to the specified business before deleting
      const call = await tx.call.findUnique({ where: { idCall }, select: { idBusiness: true } });
      if (!call) {
        throw new Error('Call not found');
      }
      if (call.idBusiness !== idBusiness) {
        throw new Error('Call does not belong to the specified business');
      }

      // Delete the call record
      await tx.call.delete({ where: { idCall } });

      // Revert business back to available. onCallSince goes with it: the lead is
      // in nobody's hands now, and leaving the old handout time behind would let
      // the reclaim "release" a row that is already released.
      await tx.business.update({
        where: { idBusiness },
        data: { idStatus: 3, onCallSince: null },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Call not found' || message === 'Call does not belong to the specified business') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('POST /api/calls/revert error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
