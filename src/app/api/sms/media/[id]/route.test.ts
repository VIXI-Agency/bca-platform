import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let session: { user: { userId: number } } | null = { user: { userId: 1 } };
const findFirst = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: async () => session,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    message: {
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

const { GET } = await import('./route');

const get = (id: string) =>
  GET(new NextRequest(`http://localhost/api/sms/media/${id}`), {
    params: Promise.resolve({ id }),
  });

const mediaQuery = (id: number) => ({
  where: { id, mediaData: { not: null } },
  select: { mediaData: true, mediaType: true, mediaName: true },
});

describe('GET /api/sms/media/[id]', () => {
  beforeEach(() => {
    session = { user: { userId: 1 } };
    findFirst.mockReset();
  });

  it('returns base64 media for a message that has some', async () => {
    findFirst.mockResolvedValue({
      mediaData: 'abc',
      mediaType: 'image/png',
      mediaName: 'shot.png',
    });
    const res = await get('7');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: 'abc', type: 'image/png', name: 'shot.png' });
    expect(findFirst).toHaveBeenCalledWith(mediaQuery(7));
  });

  it('returns 404 when the row is missing or the payload is empty', async () => {
    findFirst.mockResolvedValue(null);
    expect((await get('7')).status).toBe(404);

    findFirst.mockResolvedValue({ mediaData: '', mediaType: 'image/png', mediaName: 'shot.png' });
    expect((await get('8')).status).toBe(404);
    expect(findFirst).toHaveBeenLastCalledWith(mediaQuery(8));
  });

  it('does not query when the caller is unauthenticated', async () => {
    session = null;
    expect((await get('7')).status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
