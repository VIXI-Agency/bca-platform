import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let sessionRole = 2;
const findUnique = vi.fn();
const update = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { role: sessionRole, userId: 99 } }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...(a as [])),
      update: (...a: unknown[]) => update(...(a as [])),
    },
    payRateHistory: { create: vi.fn() },
  },
}));

const { PUT } = await import('./route');

const agent = { idUser: 50, idRole: 3, status: true, email: 'agent@x.com', payRate: null, otPayRate: null };

const put = (body: unknown) =>
  PUT(
    new NextRequest('http://localhost/api/users/50', { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: '50' }) },
  );

describe('PUT /api/users/[id] as a Closer', () => {
  beforeEach(() => {
    sessionRole = 2;
    findUnique.mockReset().mockResolvedValue(agent);
    update.mockReset().mockResolvedValue({ ...agent, status: false, name: 'A', lastname: 'B', resetToken: 'secret' });
  });

  it('can activate a remote agent (what the Users page sends)', async () => {
    const res = await put({ isActive: true, roleId: 3 });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledOnce();
  });

  it('cannot promote an agent to Administrator', async () => {
    const res = await put({ isActive: true, roleId: 1 });
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['password', { password: 'hijack123' }],
    ['email', { email: 'mine@x.com' }],
    ['name', { name: 'Someone' }],
    ['pay rate', { payRate: 50 }],
  ])('cannot change the %s', async (_label, body) => {
    const res = await put(body);
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('never returns the reset token or pay rates in the response', async () => {
    sessionRole = 1;
    const res = await put({ isActive: true });
    const json = await res.json();
    expect(json).not.toHaveProperty('resetToken');
    expect(json).not.toHaveProperty('payRate');
    expect(json).not.toHaveProperty('password');
  });
});
