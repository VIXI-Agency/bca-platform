import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let session: { user: { userId: number } } | null = { user: { userId: 1 } };
const deleteMany = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: async () => session,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    smsTemplate: {
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
  },
}));

const { DELETE } = await import('./route');

const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/sms/templates/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });

describe('DELETE /api/sms/templates/[id]', () => {
  beforeEach(() => {
    session = { user: { userId: 1 } };
    deleteMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it('deletes by numeric id and still returns ok when nothing matched', async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    const res = await del('12');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 12 } });
  });

  it('does not delete when the caller is unauthenticated', async () => {
    session = null;
    expect((await del('12')).status).toBe(401);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
