import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;

    const body = await request.json();
    const { photo } = body;

    if (!photo || typeof photo !== 'string') {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }

    if (!photo.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid photo format. Must be a base64 data URL.' }, { status: 400 });
    }

    // Block SVG uploads (XSS vector — SVGs can contain embedded scripts)
    if (photo.startsWith('data:image/svg')) {
      return NextResponse.json({ error: 'SVG files are not allowed. Please upload a JPG or PNG.' }, { status: 400 });
    }

    if (photo.length > 500000) {
      return NextResponse.json({ error: 'Photo is too large. Maximum size is roughly 350KB.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { idUser: userId },
      data: { photo },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/profile/photo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
