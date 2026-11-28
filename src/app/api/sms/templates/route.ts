import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const templates = await prisma.smsTemplate.findMany({
      select: { id: true, title: true, body: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return NextResponse.json(templates);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('GET /api/sms/templates error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { title, body } = await request.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'title and body required' }, { status: 400 });
    }

    const created = await prisma.smsTemplate.create({
      data: { title: title.trim(), body: body.trim(), sortOrder: 0 },
      select: { id: true, title: true, body: true, sortOrder: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/sms/templates error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
