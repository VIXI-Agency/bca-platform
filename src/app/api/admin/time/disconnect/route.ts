import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const DISCONNECTION_TYPES = [
  'absence',
  'early_leave',
  'power_outage',
  'internet_outage',
  'other',
] as const;

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

    if (role !== 1 && role !== 2) {
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
    const now = new Date();

    // Verify the target user exists and is active
    const targetUser = await prisma.user.findUnique({
      where: { idUser: userId },
      select: { idUser: true, status: true },
    });

    if (!targetUser || targetUser.status === true) {
      return NextResponse.json({ error: 'User not found or inactive' }, { status: 404 });
    }

    if (action === 'disconnect') {
      // Check if user already has an active disconnection (no reconnection time)
      const activeDisconnection = await prisma.employeeDisconnection.findFirst({
        where: {
          idUser: userId,
          reconnectionTime: null,
        },
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
          disconnectionDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
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
      // Reconnect: Find the active disconnection record
      const activeDisconnection = await prisma.employeeDisconnection.findFirst({
        where: {
          idUser: userId,
          reconnectionTime: null,
        },
        orderBy: { disconnectionTime: 'desc' },
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
