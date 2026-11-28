import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const row = await prisma.message.findFirst({
      where: { id: Number(id), mediaData: { not: null } },
      select: { mediaData: true, mediaType: true, mediaName: true },
    });

    if (!row?.mediaData) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      data: row.mediaData,
      type: row.mediaType,
      name: row.mediaName,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('GET /api/sms/media/[id] error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
