import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTodayRangePST, timeStringToUtcDate } from '@/lib/time';
import { isDayLocked } from '@/lib/payroll/compute';
import {
  addDisconnectionSchema,
  dayFromString,
  isFutureDay,
  windowError,
} from '@/lib/admin-time/disconnections';

/**
 * Records a disconnection after the fact — for a day already worked (e.g.
 * nobody clicked Disconnect yesterday), with explicit times. The live
 * Disconnect/Reconnect buttons (POST /disconnect) still handle "right now".
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { role, userId: adminUserId } = session.user as { role: number; userId: number };
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = addDisconnectionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { userId, date, start, end, type, reason } = parsed.data;

    const badWindow = windowError(start, end);
    if (badWindow) {
      return NextResponse.json({ error: badWindow }, { status: 400 });
    }

    const day = dayFromString(date);
    if (isFutureDay(day, getTodayRangePST().todayStart)) {
      return NextResponse.json({ error: 'A disconnection can’t be recorded for a future day.' }, { status: 400 });
    }

    if (await isDayLocked(userId, day)) {
      return NextResponse.json(
        { error: 'This pay period has been approved or paid and can no longer be edited.' },
        { status: 409 },
      );
    }

    const employee = await prisma.user.findUnique({ where: { idUser: userId }, select: { idUser: true } });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const startTime = timeStringToUtcDate(start);
    const endTime = end === null ? null : timeStringToUtcDate(end);

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.employeeDisconnection.create({
        data: {
          idUser: userId,
          disconnectionDate: day,
          disconnectionTime: startTime,
          reconnectionTime: endTime,
          disconnectionType: type,
          reason,
          disconnectedBy: String(adminUserId),
          reconnectedBy: endTime ? String(adminUserId) : null,
          // Legacy flag (0 = reconnected); kept consistent for old readers.
          isActive: endTime === null,
        },
      });
      await tx.employeeDisconnectionAudit.create({
        data: {
          idDisconnection: row.idDisconnection,
          idUser: userId,
          action: 'add',
          disconnectionDate: day,
          oldStart: null,
          oldEnd: null,
          oldType: null,
          newStart: startTime,
          newEnd: endTime,
          newType: type,
          reason,
          modifiedBy: String(adminUserId),
        },
      });
      return row;
    });

    return NextResponse.json({ data: { id: created.idDisconnection } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/time/disconnections error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
