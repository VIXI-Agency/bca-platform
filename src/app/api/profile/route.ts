import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateProfileSchema } from '@/lib/validators';
import bcrypt from 'bcryptjs';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;

    const user = await prisma.user.findUnique({
      where: { idUser: userId },
      include: {
        role: { select: { role: true } },
        schedules: { orderBy: { dayOfWeek: 'asc' } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      userId: user.idUser,
      name: user.name ?? '',
      lastname: user.lastname ?? '',
      email: user.email ?? '',
      role: user.idRole ?? 4,
      roleName: user.role?.role ?? 'Unknown',
      timezone: user.timeZone ?? '',
      city: user.city ?? '',
      state: user.state ?? '',
      country: user.country ?? '',
      photo: user.photo ?? null,
      schedule: user.schedules.map((s) => ({
        day: DAY_NAMES[Number(s.dayOfWeek)] ?? s.dayOfWeek,
        startTime: s.startTime
          ? `${String(s.startTime.getUTCHours()).padStart(2, '0')}:${String(s.startTime.getUTCMinutes()).padStart(2, '0')}`
          : '09:00',
        endTime: s.endTime
          ? `${String(s.endTime.getUTCHours()).padStart(2, '0')}:${String(s.endTime.getUTCMinutes()).padStart(2, '0')}`
          : '17:00',
      })),
    });
  } catch (error) {
    console.error('GET /api/profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword, name, lastname, timezone, city, state, country } = parsed.data;

    // If changing password, verify current password first
    if (newPassword) {
      const user = await prisma.user.findUnique({ where: { idUser: userId } });
      if (!user || !user.password) {
        return NextResponse.json({ error: 'Unable to verify current password' }, { status: 400 });
      }

      const passwordValid = await bcrypt.compare(currentPassword!, user.password);
      if (!passwordValid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
      }
    }

    // Build update data - only allowed fields (NOT email, NOT role)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};

    if (name !== undefined) data.name = name;
    if (lastname !== undefined) data.lastname = lastname;
    if (timezone !== undefined) data.timeZone = timezone;
    if (city !== undefined) data.city = city;
    if (state !== undefined) data.state = state;
    if (country !== undefined) data.country = country;

    if (newPassword) {
      data.password = await bcrypt.hash(newPassword, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { idUser: userId },
      data,
      include: {
        role: { select: { role: true } },
        schedules: { orderBy: { dayOfWeek: 'asc' } },
      },
    });

    return NextResponse.json({
      userId: updatedUser.idUser,
      name: updatedUser.name ?? '',
      lastname: updatedUser.lastname ?? '',
      email: updatedUser.email ?? '',
      role: updatedUser.idRole ?? 4,
      roleName: updatedUser.role?.role ?? 'Unknown',
      timezone: updatedUser.timeZone ?? '',
      city: updatedUser.city ?? '',
      state: updatedUser.state ?? '',
      country: updatedUser.country ?? '',
      photo: updatedUser.photo ?? null,
      schedule: updatedUser.schedules.map((s) => ({
        day: DAY_NAMES[Number(s.dayOfWeek)] ?? s.dayOfWeek,
        startTime: s.startTime
          ? `${String(s.startTime.getUTCHours()).padStart(2, '0')}:${String(s.startTime.getUTCMinutes()).padStart(2, '0')}`
          : '09:00',
        endTime: s.endTime
          ? `${String(s.endTime.getUTCHours()).padStart(2, '0')}:${String(s.endTime.getUTCMinutes()).padStart(2, '0')}`
          : '17:00',
      })),
    });
  } catch (error) {
    console.error('PUT /api/profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
