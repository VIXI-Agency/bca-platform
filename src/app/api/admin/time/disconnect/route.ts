import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { nowPstAsUtc, getTodayRangePST } from '@/lib/time';
import { isDayLocked } from '@/lib/payroll/compute';
import { DISCONNECTION_TYPES } from '@/lib/admin-time/disconnections';

const disconnectSchema = z.object({
  userId: z.number().int().positive(),
  action: z.enum(['disconnect', 'reconnect']),
  type: z.enum(DISCONNECTION_TYPES).optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    const adminUserId = (session.user as { userId: number }).userId;

    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = disconnectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { userId, action, type, reason } = parsed.data;
    // Pacific wall-clock time, the same convention as every clock punch in
    // EmployeeTimeLog. A plain new Date() would be stored as UTC, 7-8 hours
    // off, and the disconnection would land outside the shift it belongs to.
    const now = nowPstAsUtc();
    const { todayStart } = getTodayRangePST();

    // Disconnected time reduces pay, so it can't change once the period's
    // pay run is approved or paid — same rule as editing hours or bonuses.
    if (await isDayLocked(userId, todayStart)) {
      return NextResponse.json(
        { error: 'This pay period has been approved or paid and can no longer be edited.' },
        { status: 409 }
      );
    }

    // Verify the target user exists and is active
    const targetUser = await prisma.user.findUnique({
      where: { idUser: userId },
      select: { idUser: true, status: true },
    });

    if (!targetUser || targetUser.status === true) {
      return NextResponse.json({ error: 'User not found or inactive' }, { status: 404 });
    }

    // Only today's open disconnection counts as active. One left open on an
    // earlier day ends at that day's clock-out for pay purposes, so it must
    // not block a new disconnect or be the row a reconnect closes.
    const activeWhere = { idUser: userId, reconnectionTime: null, disconnectionDate: todayStart, removedAt: null };

    if (action === 'disconnect') {
      const activeDisconnection = await prisma.employeeDisconnection.findFirst({
        where: activeWhere,
      });

      if (activeDisconnection) {
        return NextResponse.json(
          { error: 'Employee is already disconnected' },
          { status: 400 }
        );
      }

      // Create disconnection record
      const disconnection = await prisma.employeeDisconnection.create({
        data: {
          idUser: userId,
          disconnectionTime: now,
          disconnectionDate: todayStart,
          disconnectedBy: String(adminUserId),
          disconnectionType: type || null,
          reason: reason || null,
        },
      });

      return NextResponse.json({
        data: disconnection,
        message: 'Employee disconnected successfully',
      });
    } else {
      const activeDisconnection = await prisma.employeeDisconnection.findFirst({
        where: activeWhere,
        orderBy: { idDisconnection: 'desc' },
      });

      if (!activeDisconnection) {
        return NextResponse.json(
          { error: 'No active disconnection found for this employee' },
          { status: 400 }
        );
      }

      // Update with reconnection time
      const updated = await prisma.employeeDisconnection.update({
        where: { idDisconnection: activeDisconnection.idDisconnection },
        data: {
          reconnectionTime: now,
        },
      });

      return NextResponse.json({
        data: updated,
        message: 'Employee reconnected successfully',
      });
    }
  } catch (error) {
    console.error('Admin disconnect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
