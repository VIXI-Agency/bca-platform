import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const session = { value: { user: { role: 1, userId: 262 } } as unknown };
const scheduleFindMany = vi.fn();
const userFindUnique = vi.fn();
const tx = {
  payRun: { count: vi.fn() },
  payrollBonusEntry: { findMany: vi.fn(), update: vi.fn() },
  payrollBonus: { findMany: vi.fn() },
  userPaySchedule: { upsert: vi.fn(), deleteMany: vi.fn() },
};

vi.mock('@/lib/auth', () => ({ auth: async () => session.value }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    userPaySchedule: { findMany: (...a: unknown[]) => scheduleFindMany(...a) },
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
const del = (effectiveFrom: string) =>
  DELETE(new NextRequest(`http://localhost/api/users/137/pay-schedule?effectiveFrom=${effectiveFrom}`, { method: 'DELETE' }), params);

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { user: { role: 1, userId: 262 } };
  scheduleFindMany.mockResolvedValue([]);
  userFindUnique.mockResolvedValue({ idUser: 137 });
  tx.payRun.count.mockResolvedValue(0);
  tx.payrollBonusEntry.findMany.mockResolvedValue([]);
  tx.payrollBonus.findMany.mockResolvedValue([]);
  tx.userPaySchedule.upsert.mockResolvedValue({});
  tx.userPaySchedule.deleteMany.mockResolvedValue({ count: 1 });
});

describe('GET /api/users/[id]/pay-schedule', () => {
  it('shows a user with no history as remote, with the week they are on today', async () => {
    const body = await (await GET(new NextRequest('http://localhost/api/users/137/pay-schedule'), params)).json();
    expect(body).toEqual({ current: 'remote', currentPeriod: 'Oct 16 - Oct 22, 2026', changes: [] });
  });
});

describe('POST /api/users/[id]/pay-schedule', () => {
  it('moves Trini to In House from Monday 10/19', async () => {
    const res = await post({ schedule: 'inhouse', effectiveFrom: '2026-10-19' });
    expect(res.status).toBe(200);
    expect(tx.userPaySchedule.upsert.mock.calls[0][0]).toMatchObject({
      where: { idUser_effectiveFrom: { idUser: 137, effectiveFrom: D('2026-10-19') } },
      create: { idUser: 137, schedule: 'inhouse', effectiveFrom: D('2026-10-19'), changedBy: '262' },
    });
  });

  it('requires In House to start on a Monday', async () => {
    const res = await post({ schedule: 'inhouse', effectiveFrom: '2026-10-20' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Monday/);
    expect(tx.userPaySchedule.upsert).not.toHaveBeenCalled();
  });

  it('refuses a switch to the week they are already on', async () => {
    expect((await post({ schedule: 'remote', effectiveFrom: '2026-10-23' })).status).toBe(400);
  });

  it('refuses when any approved or paid payroll falls in the weeks it reshapes, whoever is in it', async () => {
    // e.g. the In House run of Mon 10/12 is approved without this remote employee.
    tx.payRun.count.mockResolvedValue(1);
    const res = await post({ schedule: 'inhouse', effectiveFrom: '2026-10-12' });
    expect(res.status).toBe(409);
    expect(tx.payRun.count.mock.calls[0][0].where).toEqual({
      status: { in: ['approved', 'paid'] },
      periodStart: { gt: D('2026-10-05') },
    });
    expect(tx.userPaySchedule.upsert).not.toHaveBeenCalled();
  });

  it('re-files dated bonuses earned after a backdated switch into the new week', async () => {
    tx.payrollBonusEntry.findMany.mockResolvedValue([
      { idEntry: 5, category: 'ccfSpiffs', entryDate: D('2026-10-16'), periodStart: D('2026-10-16') },
      { idEntry: 6, category: 'ccfSpiffs', entryDate: D('2026-10-19'), periodStart: D('2026-10-16') },
    ]);
    expect((await post({ schedule: 'inhouse', effectiveFrom: '2026-10-19' })).status).toBe(200);
    expect(tx.payrollBonusEntry.update.mock.calls).toEqual([
      [{ where: { idEntry: 6 }, data: { periodStart: D('2026-10-19') } }],
    ]);
  });

  it('refuses when typed weekly bonuses would no longer belong to a pay week', async () => {
    tx.payrollBonus.findMany.mockResolvedValue([{ periodStart: D('2026-10-23'), accounts: '15.00' }]);
    const res = await post({ schedule: 'inhouse', effectiveFrom: '2026-10-19' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/week of Oct 23/);
    expect(tx.userPaySchedule.upsert).not.toHaveBeenCalled();
  });

  it('asks to try again when a simultaneous change wins (deadlock victim)', async () => {
    const { Prisma } = await import('@prisma/client');
    tx.payRun.count.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'test' }));
    const res = await post({ schedule: 'inhouse', effectiveFrom: '2026-10-19' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/try again/);
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await post({ schedule: 'inhouse', effectiveFrom: '2026-10-19' })).status).toBe(403);
  });
});

describe('DELETE /api/users/[id]/pay-schedule', () => {
  it('cancels a scheduled change', async () => {
    scheduleFindMany.mockResolvedValue([{ schedule: 'inhouse', effectiveFrom: D('2026-10-19') }]);
    expect((await del('2026-10-19')).status).toBe(200);
    expect(tx.userPaySchedule.deleteMany.mock.calls[0][0].where).toEqual({ idUser: 137, effectiveFrom: D('2026-10-19') });
  });

  it('re-files bonuses back to the remote week when a past switch is undone', async () => {
    scheduleFindMany.mockResolvedValue([{ schedule: 'inhouse', effectiveFrom: D('2026-10-19') }]);
    tx.payrollBonusEntry.findMany.mockResolvedValue([
      { idEntry: 7, category: 'wheelSpins', entryDate: D('2026-10-20'), periodStart: D('2026-10-19') },
    ]);
    expect((await del('2026-10-19')).status).toBe(200);
    expect(tx.payrollBonusEntry.update.mock.calls[0][0]).toEqual({ where: { idEntry: 7 }, data: { periodStart: D('2026-10-16') } });
  });

  it('says so when there is no change on that date', async () => {
    expect((await del('2026-10-19')).status).toBe(404);
  });
});
