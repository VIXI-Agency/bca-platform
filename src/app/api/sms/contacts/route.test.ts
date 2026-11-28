import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let session: { user: { userId: number } } | null = { user: { userId: 1 } };
const findMany = vi.fn();
const findUnique = vi.fn();
const updateMany = vi.fn();
const create = vi.fn();
const deleteMany = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: async () => session,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    contact: {
      findMany: (...args: unknown[]) => findMany(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
      create: (...args: unknown[]) => create(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
  },
}));

const { GET, POST, DELETE } = await import('./route');

const json = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/sms/contacts', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('/api/sms/contacts', () => {
  beforeEach(() => {
    session = { user: { userId: 1 } };
    findMany.mockReset();
    findUnique.mockReset();
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    create.mockReset().mockResolvedValue({ id: 9, phoneNumber: '+15551212', name: 'Ada' });
    deleteMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it('lists id, phone, and name ordered by name', async () => {
    findMany.mockResolvedValue([{ id: 2, phoneNumber: '+15550001', name: 'Ada' }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 2, phoneNumber: '+15550001', name: 'Ada' }]);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, phoneNumber: true, name: true },
      orderBy: { name: 'asc' },
    });
  });

  it('updates an existing phone without inserting', async () => {
    findUnique.mockResolvedValue({ id: 2 });
    const res = await POST(json('POST', { phone: '+15550001', name: '  Ada  ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ phoneNumber: '+15550001', name: 'Ada' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { phoneNumber: '+15550001' },
      select: { id: true },
    });
    expect(updateMany).toHaveBeenCalledOnce();
    const update = updateMany.mock.calls[0][0] as {
      where: { phoneNumber: string };
      data: { name: string; updatedAt: Date };
    };
    expect(update.where).toEqual({ phoneNumber: '+15550001' });
    expect(update.data.name).toBe('Ada');
    expect(update.data.updatedAt).toBeInstanceOf(Date);
    expect(create).not.toHaveBeenCalled();
  });

  it('inserts when the phone is new', async () => {
    findUnique.mockResolvedValue(null);
    const res = await POST(json('POST', { phone: '+15550002', name: 'Bea' }));
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
    const insert = create.mock.calls[0][0] as {
      data: { phoneNumber: string; name: string; updatedAt: Date };
    };
    expect(insert.data.phoneNumber).toBe('+15550002');
    expect(insert.data.name).toBe('Bea');
    expect(insert.data.updatedAt).toBeInstanceOf(Date);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('still returns ok when the phone is already gone', async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(json('DELETE', { phone: '+15550001' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { phoneNumber: '+15550001' } });
  });

  it('rejects a blank name and an unauthenticated caller', async () => {
    expect((await POST(json('POST', { phone: '+1', name: '  ' }))).status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();

    session = null;
    expect((await GET()).status).toBe(401);
    expect((await DELETE(json('DELETE', { phone: '+1' }))).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
