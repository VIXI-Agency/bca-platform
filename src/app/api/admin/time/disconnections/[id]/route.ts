import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPayPeriodStart, timeStringToUtcDate } from '@/lib/time';
import { isPeriodLocked } from '@/lib/payroll/compute';
import {
  editDisconnectionSchema,
  removeDisconnectionSchema,
  windowError,
} from '@/lib/admin-time/disconnections';

type Params = { params: Promise<{ id: string }> };

const LOCKED = 'This pay period has been approved or paid and can no longer be edited.';

/** Auth, id and the disconnection itself — shared by edit and remove. */
async function load(params: Params['params']) {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { role, userId: adminUserId } = session.user as { role: number; userId: number };
  if (role !== 1) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: NextResponse.json({ error: 'Invalid disconnection id' }, { status: 400 }) };
  }

  const row = await prisma.employeeDisconnection.findUnique({ where: { idDisconnection: id } });
  if (!row || row.removedAt) {
    return { error: NextResponse.json({ error: 'Disconnection not found' }, { status: 404 }) };
  }

  if (await isPeriodLocked(getPayPeriodStart(row.disconnectionDate))) {
    return { error: NextResponse.json({ error: LOCKED }, { status: 409 }) };
  }

  return { row, adminUserId };
}

/** Fixes a disconnection entered with the wrong times or type. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const parsed = editDisconnectionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { start, end, type, reason } = parsed.data;
    const badWindow = windowError(start, end);
    if (badWindow) {
      return NextResponse.json({ error: badWindow }, { status: 400 });
    }

    const loaded = await load(params);
    if ('error' in loaded) return loaded.error;
    const { row, adminUserId } = loaded;

    const startTime = timeStringToUtcDate(start);
    const endTime = end === null ? null : timeStringToUtcDate(end);

    await prisma.$transaction(async (tx) => {
      await tx.employeeDisconnection.update({
        where: { idDisconnection: row.idDisconnection },
        data: {
          disconnectionTime: startTime,
          reconnectionTime: endTime,
          disconnectionType: type,
          isActive: endTime === null,
          ...(endTime && !row.reconnectedBy ? { reconnectedBy: String(adminUserId) } : {}),
        },
      });
      await tx.employeeDisconnectionAudit.create({
        data: {
          idDisconnection: row.idDisconnection,
          idUser: row.idUser,
          action: 'edit',
          disconnectionDate: row.disconnectionDate,
          oldStart: row.disconnectionTime,
          oldEnd: row.reconnectionTime,
          oldType: row.disconnectionType,
          newStart: startTime,
          newEnd: endTime,
          newType: type,
          reason,
          modifiedBy: String(adminUserId),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/admin/time/disconnections/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Removes a disconnection entered by mistake. It's a soft delete: the row
 * stays (with who removed it and when) but no longer counts against pay.
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const parsed = removeDisconnectionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const loaded = await load(params);
    if ('error' in loaded) return loaded.error;
    const { row, adminUserId } = loaded;

    await prisma.$transaction(async (tx) => {
      await tx.employeeDisconnection.update({
        where: { idDisconnection: row.idDisconnection },
        data: { removedAt: new Date(), removedBy: String(adminUserId) },
      });
      await tx.employeeDisconnectionAudit.create({
        data: {
          idDisconnection: row.idDisconnection,
          idUser: row.idUser,
          action: 'remove',
          disconnectionDate: row.disconnectionDate,
          oldStart: row.disconnectionTime,
          oldEnd: row.reconnectionTime,
          oldType: row.disconnectionType,
          newStart: null,
          newEnd: null,
          newType: null,
          reason: parsed.data.reason,
          modifiedBy: String(adminUserId),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/time/disconnections/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
