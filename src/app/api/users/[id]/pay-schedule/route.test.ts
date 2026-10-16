import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const session = { value: { user: { role: 1, userId: 262 } } as unknown };
const scheduleFindMany = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();
const statementCount = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: async () => session.value }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPaySchedule: {
      findMany: (...a: unknown[]) => scheduleFindMany(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
    payStatement: { count: (...a: unknown[]) => statementCount(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));
vi.mock('@/lib/time', async () => ({
  ...(await vi.importActual<typeof import('@/lib/time')>('@/lib/time')),
  getTodayRangePST: () => ({
    todayStart: new Date('2026-10-16T00:00:00.000Z'),
    todayEnd: new Date('2026-10-17T00:00:00.000Z'),
  }),
}));

const { GET, POST, DELETE } = await import('./route');

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const params = { params: Promise.resolve({ id: '137' }) };
const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/users/137/pay-schedule', { method: 'POST', body: JSON.stringify(body) }), params);

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { user: { role: 1, userId: 262 } };
  scheduleFindMany.mockResolvedValue([]);
  statementCount.mockResolvedValue(0);
  userFindUnique.mockResolvedValue({ idUser: 137 });
  upsert.mockResolvedValue({});
  deleteMany.mockResolvedValue({ count: 1 });
});

describe('/api/users/[id]/pay-schedule', () => {
  it('shows a user with no history as remote, with the week they are on today', async () => {
    const body = await (await GET(new NextRequest('http://localhost/api/users/137/pay-schedule'), params)).json();
    expect(body).toEqual({ current: 'remote', currentPeriod: 'Oct 16 - Oct 22, 2026', changes: [] });
  });

  it('moves Trini to In House from Monday 10/19', async () => {
    const res = await post({ schedule: 'inhouse', effectiveFrom: '2026-10-19' });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: { idUser_effectiveFrom: { idUser: 137, effectiveFrom: D('2026-10-19') } },
      create: { idUser: 137, schedule: 'inhouse', effectiveFrom: D('2026-10-19'), changedBy: '262' },
    });
  });

  it('requires In House to start on a Monday', async () => {
    const res = await post({ schedule: 'inhouse', effectiveFrom: '2026-10-20' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Monday/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a change that would rewrite an approved or paid week', async () => {
    statementCount.mockResolvedValue(1);
    expect((await post({ schedule: 'inhouse', effectiveFrom: '2026-10-19' })).status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
    const where = statementCount.mock.calls[0][0].where;
    expect(where).toMatchObject({ idUser: 137, status: { not: 'void' } });
  });

  it('refuses a switch to the week they are already on', async () => {
    expect((await post({ schedule: 'remote', effectiveFrom: '2026-10-23' })).status).toBe(400);
  });

  it('cancels a scheduled change', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/users/137/pay-schedule?effectiveFrom=2026-10-19', { method: 'DELETE' }), params);
    expect(res.status).toBe(200);
    expect(deleteMany.mock.calls[0][0].where).toEqual({ idUser: 137, effectiveFrom: D('2026-10-19') });
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await post({ schedule: 'inhouse', effectiveFrom: '2026-10-19' })).status).toBe(403);
  });
});
