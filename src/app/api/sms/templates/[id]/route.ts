import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    // deleteMany matches DELETE: a missing id still returns ok.
    await prisma.smsTemplate.deleteMany({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('DELETE /api/sms/templates/[id] error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
