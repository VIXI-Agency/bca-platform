import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;

    const videos = await prisma.video.findMany({
      include: {
        views: {
          where: { userId },
          select: { id: true, viewedOn: true },
        },
      },
      orderBy: { videoId: 'asc' },
    });

    const result = videos.map((video) => ({
      id: video.videoId,
      title: video.videoTitle,
      url: video.videoFilePath ?? '',
      watched: video.views.length > 0,
      watchedAt: video.views.length > 0 ? video.views[0].viewedOn : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/videos error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Register a new training video (admins/managers only). The file itself must
// already be uploaded to public/assets/files on the server; this just adds the
// DB row so it shows up on the Training page.
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1 && role !== 2) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const filename = typeof body?.filename === 'string' ? body.filename.trim() : '';

    if (!title || !filename) {
      return NextResponse.json(
        { error: 'Title and filename are required' },
        { status: 400 },
      );
    }
    if (!/\.(mp4|mov|webm)$/i.test(filename)) {
      return NextResponse.json(
        { error: 'Filename must end in .mp4, .mov or .webm' },
        { status: 400 },
      );
    }

    // VideoId may be a DB identity (auto-assigned) column even though the Prisma
    // schema doesn't declare it. If so, supplying VideoId explicitly errors, so
    // detect it: identity → let the DB assign the id; otherwise → assign max+1.
    const idCheck = await prisma.$queryRaw<{ isIdentity: number | null }[]>`
      SELECT COLUMNPROPERTY(OBJECT_ID('benjaise_sqluser2.Videos'), 'VideoId', 'IsIdentity') AS isIdentity
    `;
    const isIdentity = idCheck?.[0]?.isIdentity === 1;

    let createdId: number;
    if (isIdentity) {
      const inserted = await prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO benjaise_sqluser2.Videos (VideoTitle, VideoFilePath)
        OUTPUT INSERTED.VideoId AS id
        VALUES (${title}, ${filename})
      `;
      createdId = inserted[0].id;
    } else {
      const max = await prisma.video.aggregate({ _max: { videoId: true } });
      const nextId = (max._max.videoId ?? 0) + 1;
      const created = await prisma.video.create({
        data: { videoId: nextId, videoTitle: title, videoFilePath: filename },
      });
      createdId = created.videoId;
    }

    return NextResponse.json({ id: createdId, title, url: filename });
  } catch (error) {
    console.error('POST /api/videos error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
