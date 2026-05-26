import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import path from 'path';
import fs from 'fs';

const ASSETS_PATH =
  process.env.VIDEO_ASSETS_PATH ||
  path.join(process.cwd(), '..', 'assets', 'files');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { filename } = await params;
  const safeName = path.basename(filename);

  if (
    safeName !== filename ||
    !/^[a-zA-Z0-9._-]+\.(mp4|mov|webm)$/.test(safeName)
  ) {
    return new NextResponse('Invalid filename', { status: 400 });
  }

  const videoPath = path.join(ASSETS_PATH, safeName);

  if (!fs.existsSync(videoPath)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = request.headers.get('range');

  const ext = path.extname(safeName).toLowerCase();
  const contentType =
    ext === '.mov' ? 'video/quicktime' :
    ext === '.webm' ? 'video/webm' :
    'video/mp4';

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunksize = end - start + 1;

    const nodeStream = fs.createReadStream(videoPath, { start, end });
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => controller.enqueue(chunk));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
    });

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunksize),
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  const nodeStream = fs.createReadStream(videoPath);
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => controller.enqueue(chunk));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
  });

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
