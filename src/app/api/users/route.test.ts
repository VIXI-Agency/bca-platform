import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let sessionRole = 1;
const findUnique = vi.fn();
const create = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { role: sessionRole, userId: 99 } }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...(a as [])),
      create: (...a: unknown[]) => create(...(a as [])),
    },
  },
}));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));

const { POST } = await import('./route');

const newUser = { name: 'Lauren', lastname: 'F', email: 'lauren@x.com', password: 'secret123', roleId: 3 };

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/users', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/users — clock-in start', () => {
  beforeEach(() => {
    sessionRole = 1;
    findUnique.mockReset().mockResolvedValue(null);
    create.mockReset().mockImplementation(async (args: { data: object }) => ({ idUser: 7, ...args.data }));
  });

  it('saves the shift start the admin picked', async () => {
    expect((await post({ ...newUser, clockInStart: 300 })).status).toBeLessThan(300);
    expect(create.mock.calls[0][0].data.clockInStartMinutes).toBe(300);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('clockInStart');
  });

  it.each([
    ['not sent', {}],
    ['null', { clockInStart: null }],
    ['6:00 AM', { clockInStart: 360 }],
  ])('leaves a new user on the default when the start is %s', async (_label, extra) => {
    await post({ ...newUser, ...extra });
    expect(create.mock.calls[0][0].data.clockInStartMinutes).toBeNull();
  });

  it.each([[315], [600], ['300']])('rejects %j', async (clockInStart) => {
    const res = await post({ ...newUser, clockInStart });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('is refused for a Closer', async () => {
    sessionRole = 2;
    const res = await post({ ...newUser, clockInStart: 300 });
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});
