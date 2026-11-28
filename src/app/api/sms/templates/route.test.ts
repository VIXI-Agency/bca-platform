import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let session: { user: { userId: number } } | null = { user: { userId: 1 } };
const findMany = vi.fn();
const create = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: async () => session,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    smsTemplate: {
      findMany: (...args: unknown[]) => findMany(...args),
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

const { GET, POST } = await import('./route');

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/sms/templates', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );

describe('/api/sms/templates', () => {
  beforeEach(() => {
    session = { user: { userId: 1 } };
    findMany.mockReset();
    create.mockReset();
  });

  it('lists templates by sort order, then id', async () => {
    const rows = [{ id: 1, title: 'Intro', body: 'Hello', sortOrder: 0 }];
    findMany.mockResolvedValue(rows);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, title: true, body: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  });

  it('inserts a trimmed template at sort order 0 and returns that row', async () => {
    const created = { id: 4, title: 'Intro', body: 'Hello', sortOrder: 0 };
    create.mockResolvedValue(created);
    const res = await post({ title: '  Intro  ', body: '  Hello  ' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(create).toHaveBeenCalledWith({
      data: { title: 'Intro', body: 'Hello', sortOrder: 0 },
      select: { id: true, title: true, body: true, sortOrder: true },
    });
  });

  it('rejects a blank title and an unauthenticated caller', async () => {
    expect((await post({ title: '  ', body: 'Hello' })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();

    session = null;
    expect((await GET()).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});
