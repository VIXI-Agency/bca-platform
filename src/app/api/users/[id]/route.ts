import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateUserSchema } from '@/lib/validators';
import bcrypt from 'bcryptjs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const idUser = Number(id);
    if (isNaN(idUser)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { idUser },
      include: {
        role: { select: { role: true } },
        schedules: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Transform to match frontend User interface
    return NextResponse.json({
      userId: user.idUser,
      name: user.name ?? '',
      lastname: user.lastname ?? '',
      email: user.email ?? '',
      role: user.idRole ?? 3,
      isActive: user.status !== true,
      isPartTime: user.isPartTime === true,
      smsAccess: user.smsAccess === true,
      sendEmail: user.sendEmail === 1,
      timezone: user.timeZone ?? '',
      city: user.city ?? '',
      state: user.state ?? '',
      country: user.country ?? '',
      payRate: user.payRate ? Number(user.payRate) : null,
      otPayRate: user.otPayRate ? Number(user.otPayRate) : null,
      schedules: user.schedules,
    });
  } catch (error) {
    console.error('GET /api/users/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1 && role !== 2) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const idUser = Number(id);
    if (isNaN(idUser)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { idUser } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Closers can only activate/deactivate remote agents (role 3)
    if (role === 2 && existing.idRole !== 3 && existing.idRole !== 4) {
      return NextResponse.json({ error: 'Closers can only manage remote agent accounts' }, { status: 403 });
    }

    const { password, roleId, timezone, sendEmail, smsAccess, ...rest } = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {
      ...rest,
    };

    if (sendEmail !== undefined) {
      data.sendEmail = sendEmail ? 1 : 0;
    }

    if (smsAccess !== undefined) {
      data.smsAccess = smsAccess;
    }

    if (roleId !== undefined) {
      data.idRole = roleId;
    }

    if (timezone !== undefined) {
      data.timeZone = timezone;
    }

    if (password) {
      data.password = await bcrypt.hash(password, 12);
    }

    // Handle activate/deactivate via isActive field
    if (body.isActive === true) {
      data.status = false; // active
    } else if (body.isActive === false) {
      data.status = true; // blocked
    }

    // Check email uniqueness if email is being changed
    if (rest.email && rest.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: rest.email },
      });
      if (emailTaken) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
    }

    const user = await prisma.user.update({
      where: { idUser },
      data,
      include: {
        role: { select: { role: true } },
      },
    });

    const { password: _pw, ...safeUser } = user;

    return NextResponse.json(safeUser);
  } catch (error) {
    console.error('PUT /api/users/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1 && role !== 2) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const idUser = Number(id);
    if (isNaN(idUser)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { idUser } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Closers can only deactivate remote agents (role 3)
    if (role === 2 && existing.idRole !== 3) {
      return NextResponse.json({ error: 'Closers can only deactivate remote agent accounts' }, { status: 403 });
    }

    // Soft delete: set status to 1 (blocked in old app convention)
    await prisma.user.update({
      where: { idUser },
      data: { status: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/users/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
