import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contacts = await prisma.contact.findMany({
      select: { id: true, phoneNumber: true, name: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(contacts);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('GET /api/sms/contacts error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, name } = await request.json();
    if (!phone || !name?.trim()) {
      return NextResponse.json({ error: 'phone and name required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const now = new Date();

    const existing = await prisma.contact.findUnique({
      where: { phoneNumber: phone },
      select: { id: true },
    });

    if (existing) {
      // updateMany matches UPDATE: a missing row is not an error.
      await prisma.contact.updateMany({
        where: { phoneNumber: phone },
        data: { name: trimmedName, updatedAt: now },
      });
    } else {
      await prisma.contact.create({
        data: { phoneNumber: phone, name: trimmedName, updatedAt: now },
      });
    }

    return NextResponse.json({ phoneNumber: phone, name: trimmedName });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/sms/contacts error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone } = await request.json();
    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

    await prisma.contact.deleteMany({ where: { phoneNumber: phone } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('DELETE /api/sms/contacts error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
