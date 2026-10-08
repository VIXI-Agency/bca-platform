import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createUserSchema, userSearchSchema } from '@/lib/validators';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1 && role !== 2) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const parsed = userSearchSchema.safeParse({
      search: searchParams.get('search') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { AND: [] };

    if (parsed.data.search) {
      const search = parsed.data.search;
      where.AND.push({
        OR: [
          { name: { contains: search } },
          { lastname: { contains: search } },
          { email: { contains: search } },
        ],
      });
    }

    const statusParam = searchParams.get('status');
    // Active = status is null or false (not blocked)
    // Inactive = status is true (blocked)
    if (statusParam === 'active') {
      where.AND.push({ OR: [{ status: false }, { status: null }] });
    } else if (statusParam === 'inactive') {
      where.AND.push({ status: true });
    }

    if (where.AND.length === 0) delete where.AND;

    const users = await prisma.user.findMany({
      where,
      include: {
        role: { select: { role: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Transform to match frontend User interface
    const safeUsers = users.map((user) => ({
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
    }));

    return NextResponse.json(safeUsers);
  } catch (error) {
    console.error('GET /api/users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { password, roleId, timezone, sendEmail, ...rest } = parsed.data;

    // Check for duplicate email
    const existing = await prisma.user.findUnique({
      where: { email: rest.email },
    });
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        ...rest,
        password: hashedPassword,
        idRole: roleId,
        timeZone: timezone || '',
        city: rest.city || '',
        state: rest.state || '',
        country: rest.country || '',
        sendEmail: sendEmail ? 1 : 0,
        status: false,
      },
      include: {
        role: { select: { role: true } },
      },
    });

    return NextResponse.json({
      userId: user.idUser,
      name: user.name ?? '',
      lastname: user.lastname ?? '',
      email: user.email ?? '',
      role: user.idRole ?? 3,
      isActive: user.status !== true,
      isPartTime: user.isPartTime === true,
      timezone: user.timeZone ?? '',
      city: user.city ?? '',
      state: user.state ?? '',
      country: user.country ?? '',
      payRate: user.payRate ? Number(user.payRate) : null,
      otPayRate: user.otPayRate ? Number(user.otPayRate) : null,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
