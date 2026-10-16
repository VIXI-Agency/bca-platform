import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { value: { user: { role: 1, userId: 262 } } as unknown };
const locked = { value: false };
const today = new Date('2026-10-15T00:00:00.000Z'); // Thu, last day of the Oct 9 period

const tx = { payrollBonusEntry: { findMany: vi.fn(), create: vi.fn() } };
const entryFindMany = vi.fn();
const entryFindUnique = vi.fn();
const entryDelete = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: async () => session.value }));
const scheduleFindMany = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPaySchedule: { findMany: (...a: unknown[]) => scheduleFindMany(...a) },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    payrollBonusEntry: {
      findMany: (...a: unknown[]) => entryFindMany(...a),
      findUnique: (...a: unknown[]) => entryFindUnique(...a),
      delete: (...a: unknown[]) => entryDelete(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));
vi.mock('@/lib/payroll/compute', () => ({ isPeriodLocked: async () => locked.value }));
vi.mock('@/lib/time', async () => ({
  ...(await vi.importActual<typeof import('@/lib/time')>('@/lib/time')),
  getTodayRangePST: () => ({ todayStart: today, todayEnd: new Date(today.getTime() + 86_400_000) }),
}));

const { GET, POST } = await import('./route');
const { DELETE } = await import('../../bonus-entries/[id]/route');

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const PERIOD = D('2026-10-09');
const userParams = { params: Promise.resolve({ userId: '40' }) };
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/admin/time/40/bonus-entries', { method: 'POST', body: JSON.stringify(body) }), userParams);
const row = (id: number, category: string, iso: string, amount = '7.00') =>
  ({ idEntry: id, idUser: 40, periodStart: PERIOD, category, entryDate: D(iso), amount, modifiedBy: '262', createdAt: D(iso) });

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { user: { role: 1, userId: 262 } };
  locked.value = false;
  userFindUnique.mockResolvedValue({ idUser: 40 });
  tx.payrollBonusEntry.findMany.mockResolvedValue([]);
  tx.payrollBonusEntry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ idEntry: 9, ...data }));
  entryFindMany.mockResolvedValue([]);
  scheduleFindMany.mockResolvedValue([]);
});

describe('GET /api/admin/time/[userId]/bonus-entries', () => {
  it('lists the period’s dated bonuses, oldest first', async () => {
    entryFindMany.mockResolvedValue([row(1, 'wheelSpins', '2026-10-12', '14.00'), row(2, 'ccfSpiffs', '2026-10-13', '5.50')]);
    const res = await GET(new Request('http://localhost/api/admin/time/40/bonus-entries?week=2026-10-14'), userParams);
    const body = await res.json();
    expect(entryFindMany.mock.calls[0][0].where).toEqual({ idUser: 40, periodStart: PERIOD });
    expect(body.entries).toEqual([
      { id: 1, category: 'wheelSpins', date: '2026-10-12', amount: 14 },
      { id: 2, category: 'ccfSpiffs', date: '2026-10-13', amount: 5.5 },
    ]);
  });
});

describe('POST /api/admin/time/[userId]/bonus-entries', () => {
  it('adds a Wheel Spin to the period the date falls in', async () => {
    const res = await post({ category: 'wheelSpins', date: '2026-10-12', amount: 14 });
    expect(res.status).toBe(201);
    expect(tx.payrollBonusEntry.create.mock.calls[0][0].data).toMatchObject({
      idUser: 40, periodStart: PERIOD, category: 'wheelSpins', entryDate: D('2026-10-12'), amount: 14, modifiedBy: '262',
    });
  });

  it.each([0.1, 0.29, 19.99, 1234.5])('accepts an amount with cents (%s)', async (amount) => {
    expect((await post({ category: 'ccfSpiffs', date: '2026-10-12', amount })).status).toBe(201);
  });

  it('allows a second Wheel Spin on the same day', async () => {
    tx.payrollBonusEntry.findMany.mockResolvedValue([row(1, 'wheelSpins', '2026-10-12')]);
    expect((await post({ category: 'wheelSpins', date: '2026-10-12', amount: 7 })).status).toBe(201);
  });

  it('refuses a third Wheel Spin in the period', async () => {
    tx.payrollBonusEntry.findMany.mockResolvedValue([row(1, 'wheelSpins', '2026-10-09'), row(2, 'wheelSpins', '2026-10-12')]);
    const res = await post({ category: 'wheelSpins', date: '2026-10-13', amount: 7 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Wheel Spins: at most 2 per pay period.');
    expect(tx.payrollBonusEntry.create).not.toHaveBeenCalled();
  });

  it('refuses a second CCF Spiff on the same day', async () => {
    tx.payrollBonusEntry.findMany.mockResolvedValue([row(1, 'ccfSpiffs', '2026-10-13')]);
    const res = await post({ category: 'ccfSpiffs', date: '2026-10-13', amount: 5 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CCF Spiffs: only one per day.');
  });

  it('files an In House employee’s bonus under their Monday week', async () => {
    scheduleFindMany.mockResolvedValue([{ schedule: 'inhouse', effectiveFrom: D('2026-10-12') }]);
    await post({ category: 'ccfSpiffs', date: '2026-10-15', amount: 5 });
    const monday = D('2026-10-12');
    expect(tx.payrollBonusEntry.findMany.mock.calls[0][0].where).toEqual({ idUser: 40, periodStart: monday });
    expect(tx.payrollBonusEntry.create.mock.calls[0][0].data).toMatchObject({ periodStart: monday });
  });

  it('checks the caps against this employee’s entries in this period', async () => {
    await post({ category: 'ccfSpiffs', date: '2026-10-13', amount: 5 });
    expect(tx.payrollBonusEntry.findMany.mock.calls[0][0].where).toEqual({ idUser: 40, periodStart: PERIOD });
  });

  it.each([
    ['a weekend day', { date: '2026-10-10' }],
    ['a future day', { date: '2026-10-16' }],
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['more than 2 decimals', { amount: 5.555 }],
    ['an unknown category', { category: 'discretionaryBonus' }],
    ['a malformed date', { date: '10/12/2026' }],
  ])('rejects %s', async (_name, change) => {
    const res = await post({ category: 'wheelSpins', date: '2026-10-12', amount: 7, ...change });
    expect(res.status).toBe(400);
    expect(tx.payrollBonusEntry.create).not.toHaveBeenCalled();
  });

  it('refuses a period that is approved or paid', async () => {
    locked.value = true;
    expect((await post({ category: 'wheelSpins', date: '2026-10-12', amount: 7 })).status).toBe(409);
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await post({ category: 'wheelSpins', date: '2026-10-12', amount: 7 })).status).toBe(403);
  });
});

describe('DELETE /api/admin/time/bonus-entries/[id]', () => {
  const del = (id: string) =>
    DELETE(new Request(`http://localhost/api/admin/time/bonus-entries/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

  it('removes an entry', async () => {
    entryFindUnique.mockResolvedValue(row(3, 'ccfSpiffs', '2026-10-13'));
    expect((await del('3')).status).toBe(200);
    expect(entryDelete.mock.calls[0][0]).toEqual({ where: { idEntry: 3 } });
  });

  it('refuses a locked period and a missing entry', async () => {
    entryFindUnique.mockResolvedValue(row(3, 'ccfSpiffs', '2026-10-13'));
    locked.value = true;
    expect((await del('3')).status).toBe(409);
    locked.value = false;
    entryFindUnique.mockResolvedValue(null);
    expect((await del('3')).status).toBe(404);
    expect(entryDelete).not.toHaveBeenCalled();
  });
});
