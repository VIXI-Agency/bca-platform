import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { value: { user: { role: 1, userId: 262 } } as unknown };
const locked = { value: false };

const tx = { payrollCustomBonus: { findMany: vi.fn(), create: vi.fn() } };
const customFindMany = vi.fn();
const customGroupBy = vi.fn();
const customFindUnique = vi.fn();
const customDelete = vi.fn();
const userFindUnique = vi.fn();
const scheduleFindMany = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);

vi.mock('@/lib/auth', () => ({ auth: async () => session.value }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPaySchedule: { findMany: (...a: unknown[]) => scheduleFindMany(...a) },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    payrollCustomBonus: {
      findMany: (...a: unknown[]) => customFindMany(...a),
      groupBy: (...a: unknown[]) => customGroupBy(...a),
      findUnique: (...a: unknown[]) => customFindUnique(...a),
      delete: (...a: unknown[]) => customDelete(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));
vi.mock('@/lib/payroll/compute', () => ({ isPeriodLocked: async () => locked.value }));

const { GET, POST } = await import('./route');
const { DELETE } = await import('../../custom-bonuses/[id]/route');

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const PERIOD = D('2026-10-09'); // remote week Fri 10/9 – Thu 10/15
const userParams = { params: Promise.resolve({ userId: '40' }) };
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/admin/time/40/custom-bonuses', { method: 'POST', body: JSON.stringify(body) }), userParams);
const raffle = (change: Record<string, unknown> = {}) => post({ period: '2026-10-09', name: 'Raffle', amount: 50, ...change });
const row = (id: number, name: string, amount = '50.00') =>
  ({ idCustomBonus: id, idUser: 40, periodStart: PERIOD, name, amount, modifiedBy: '262', createdAt: PERIOD });

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { user: { role: 1, userId: 262 } };
  locked.value = false;
  userFindUnique.mockResolvedValue({ idUser: 40 });
  tx.payrollCustomBonus.findMany.mockResolvedValue([]);
  tx.payrollCustomBonus.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ idCustomBonus: 9, ...data }));
  customFindMany.mockResolvedValue([]);
  customGroupBy.mockResolvedValue([]);
  scheduleFindMany.mockResolvedValue([]);
});

describe('GET /api/admin/time/[userId]/custom-bonuses', () => {
  const get = () => GET(new Request('http://localhost/api/admin/time/40/custom-bonuses?week=2026-10-14'), userParams);

  it('lists the period’s custom bonuses in the order they were added', async () => {
    customFindMany.mockResolvedValue([row(1, 'Raffle'), row(2, 'Birthday Bonus', '25.50')]);
    const body = await (await get()).json();
    expect(customFindMany.mock.calls[0][0].where).toEqual({ idUser: 40, periodStart: PERIOD });
    expect(body.bonuses).toEqual([
      { id: 1, name: 'Raffle', amount: 50 },
      { id: 2, name: 'Birthday Bonus', amount: 25.5 },
    ]);
  });

  it('suggests the names used before, most used first, then the starter names', async () => {
    customGroupBy.mockResolvedValue([{ name: 'Thanksgiving Bonus', _count: { name: 9 } }, { name: 'raffle', _count: { name: 4 } }]);
    const body = await (await get()).json();
    expect(body.suggestions).toEqual(['Thanksgiving Bonus', 'raffle', 'Birthday Bonus']);
  });

  it('suggests Raffle and Birthday Bonus before any has been used', async () => {
    expect((await (await get()).json()).suggestions).toEqual(['Raffle', 'Birthday Bonus']);
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await get()).status).toBe(403);
    session.value = null;
    expect((await get()).status).toBe(401);
  });
});

describe('POST /api/admin/time/[userId]/custom-bonuses', () => {
  it('adds the bonus to the pay period, with the name tidied', async () => {
    const res = await raffle({ name: '  Birthday   Bonus ' });
    expect(res.status).toBe(201);
    expect(tx.payrollCustomBonus.create.mock.calls[0][0].data).toEqual({
      idUser: 40, periodStart: PERIOD, name: 'Birthday Bonus', amount: 50, modifiedBy: '262',
    });
  });

  it('files it under the period that contains the day sent', async () => {
    await raffle({ period: '2026-10-14' });
    expect(tx.payrollCustomBonus.create.mock.calls[0][0].data).toMatchObject({ periodStart: PERIOD });
  });

  it('files an In House employee’s bonus under their Monday week', async () => {
    scheduleFindMany.mockResolvedValue([{ schedule: 'inhouse', effectiveFrom: D('2026-10-12') }]);
    await raffle({ period: '2026-10-15' });
    expect(tx.payrollCustomBonus.create.mock.calls[0][0].data).toMatchObject({ periodStart: D('2026-10-12') });
  });

  it.each([0.1, 19.99, 1234.5])('accepts an amount with cents (%s)', async (amount) => {
    expect((await raffle({ amount })).status).toBe(201);
  });

  it('refuses a sixth custom bonus in the period', async () => {
    tx.payrollCustomBonus.findMany.mockResolvedValue(['A', 'B', 'C', 'D', 'E'].map((name) => ({ name })));
    const res = await raffle();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Custom bonuses: at most 5 per pay period.');
    expect(tx.payrollCustomBonus.create).not.toHaveBeenCalled();
  });

  it('refuses the same name twice in the period', async () => {
    tx.payrollCustomBonus.findMany.mockResolvedValue([{ name: 'raffle' }]);
    const res = await raffle();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already a "Raffle" bonus/);
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['a name over 40 characters', { name: 'x'.repeat(41) }],
    ['no name', { name: undefined }],
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['more than 2 decimals', { amount: 5.555 }],
    ['no amount', { amount: undefined }],
    ['a malformed period', { period: '10/09/2026' }],
  ])('rejects %s', async (_name, change) => {
    expect((await raffle(change)).status).toBe(400);
    expect(tx.payrollCustomBonus.create).not.toHaveBeenCalled();
  });

  it('refuses a period that is approved or paid', async () => {
    locked.value = true;
    expect((await raffle()).status).toBe(409);
    expect(tx.payrollCustomBonus.create).not.toHaveBeenCalled();
  });

  it('refuses an employee that does not exist', async () => {
    userFindUnique.mockResolvedValue(null);
    expect((await raffle()).status).toBe(404);
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await raffle()).status).toBe(403);
  });
});

describe('DELETE /api/admin/time/custom-bonuses/[id]', () => {
  const del = (id: string) =>
    DELETE(new Request(`http://localhost/api/admin/time/custom-bonuses/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

  it('removes a custom bonus', async () => {
    customFindUnique.mockResolvedValue(row(3, 'Raffle'));
    expect((await del('3')).status).toBe(200);
    expect(customDelete.mock.calls[0][0]).toEqual({ where: { idCustomBonus: 3 } });
  });

  it('refuses a locked period and a missing bonus', async () => {
    customFindUnique.mockResolvedValue(row(3, 'Raffle'));
    locked.value = true;
    expect((await del('3')).status).toBe(409);
    locked.value = false;
    customFindUnique.mockResolvedValue(null);
    expect((await del('3')).status).toBe(404);
    expect(customDelete).not.toHaveBeenCalled();
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await del('3')).status).toBe(403);
  });
});
