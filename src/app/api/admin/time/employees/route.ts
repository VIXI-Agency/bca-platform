import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1 && role !== 2) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const employees = await prisma.user.findMany({
      where: {
        OR: [{ status: null }, { status: false }],
        idRole: { in: [1, 2, 3] },
      },
      select: {
        idUser: true,
        name: true,
        lastname: true,
        email: true,
        idRole: true,
        isPartTime: true,
        payRate: true,
        otPayRate: true,
      },
      orderBy: [{ name: 'asc' }, { lastname: 'asc' }],
    });

    const data = employees.map((emp) => ({
      userId: emp.idUser,
      name: `${emp.name ?? ''} ${emp.lastname ?? ''}`.trim(),
      email: emp.email ?? '',
      role: emp.idRole,
      isPartTime: emp.isPartTime,
      payRate: emp.payRate ? Number(emp.payRate) : null,
      otPayRate: emp.otPayRate ? Number(emp.otPayRate) : null,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Admin time employees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
