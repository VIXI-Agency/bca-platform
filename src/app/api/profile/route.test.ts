import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

const findUnique = vi.fn();
const update = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { userId: 7 } }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const { PUT } = await import('./route');

const currentHash = bcrypt.hashSync('current-secret', 4);

const saved = {
  idUser: 7,
  name: 'Ada',
  lastname: 'L',
  email: 'ada@x.com',
  idRole: 3,
  timeZone: 'EST',
  city: '',
  state: '',
  country: '',
  photo: null,
  role: { role: 'Agent' },
  schedules: [],
};

function put(body: unknown) {
  return PUT(
    new NextRequest('http://localhost/api/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  );
}

describe('PUT /api/profile current password', () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset().mockImplementation(async (args: { data: object }) => ({ ...saved, ...args.data }));
  });

  it('accepts a bcrypt current password and stores a bcrypt hash', async () => {
    findUnique.mockResolvedValue({ password: currentHash });
    const res = await put({ currentPassword: 'current-secret', newPassword: 'new-secret' });
    expect(res.status).toBe(200);
    const stored = update.mock.calls[0][0].data.password as string;
    expect(stored.startsWith('$2a$') || stored.startsWith('$2b$')).toBe(true);
    expect(await bcrypt.compare('new-secret', stored)).toBe(true);
    expect(update).toHaveBeenCalledOnce();
  });

  it('rejects a wrong current password', async () => {
    findUnique.mockResolvedValue({ password: currentHash });
    const res = await put({ currentPassword: 'wrong-secret', newPassword: 'new-secret' });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a plaintext password that matches the stored value', async () => {
    findUnique.mockResolvedValue({ password: 'current-secret' });
    const res = await put({ currentPassword: 'current-secret', newPassword: 'new-secret' });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
