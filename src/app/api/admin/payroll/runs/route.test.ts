import { describe, it, expect, vi, beforeEach } from 'vitest';

const today = { value: new Date('2026-10-16T00:00:00.000Z') }; // Fri: the Oct 9 period has ended

const tx = {
  payRun: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  payStatement: { updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  payStatementLine: { deleteMany: vi.fn(), createMany: vi.fn() },
};
const transaction = vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));
const workedFindMany = vi.fn();
const usersFindMany = vi.fn();
const computePayStatement = vi.fn();
const scheduleFindMany = vi.fn();
const runFindUnique = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null);

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { role: 1, userId: 1 } }) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => transaction(fn),
    employeeTimeLog: { findMany: (...a: unknown[]) => workedFindMany(...a) },
    user: { findMany: (...a: unknown[]) => usersFindMany(...a) },
    userPaySchedule: { findMany: (...a: unknown[]) => scheduleFindMany(...a) },
    payRun: { findUnique: (...a: unknown[]) => runFindUnique(...a) },
  },
}));
vi.mock('@/lib/payroll/compute', () => ({
  computePayStatement: (...a: unknown[]) => computePayStatement(...a),
}));
vi.mock('@/lib/time', async () => ({
  ...(await vi.importActual<typeof import('@/lib/time')>('@/lib/time')),
  getTodayRangePST: () => ({ todayStart: today.value, todayEnd: new Date(today.value.getTime() + 86_400_000) }),
}));

const { GET, POST } = await import('./route');

const approve = (body: object = { period: '2026-10-09' }) =>
  POST(new Request('http://localhost/api/admin/payroll/runs', { method: 'POST', body: JSON.stringify(body) }));
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const amounts = {
  regularHours: 40, overtimeHours: 2, payRate: 10, otPayRate: 15,
  regularPay: 400, overtimePay: 30, bonusTotal: 0, grossPay: 430,
  bonusAmounts: {
    discretionaryBonus: 0, collectionsBonus: 0, trainingBonus: 0, managerBonus: 0,
    wheelSpins: 0, accounts: 0, reloads: 0, verifiedLeads: 0,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  today.value = new Date('2026-10-16T00:00:00.000Z');
  workedFindMany.mockResolvedValue([]);
  usersFindMany.mockResolvedValue([
    { idUser: 10, name: 'Paid', lastname: 'Already' },
    { idUser: 20, name: 'New', lastname: 'Person' },
  ]);
  computePayStatement.mockResolvedValue(amounts);
  scheduleFindMany.mockResolvedValue([]);
  tx.payRun.findUnique.mockResolvedValue(null);
  tx.payRun.create.mockResolvedValue({ idPayRun: 7 });
  tx.payStatement.updateMany.mockResolvedValue({ count: 0 });
  tx.payStatement.findUnique.mockImplementation(async (args: { where: { idPayRun_idUser: { idUser: number } } }) =>
    args.where.idPayRun_idUser.idUser === 10 ? { idStatement: 100 } : null,
  );
  tx.payStatement.create.mockResolvedValue({ idStatement: 200 });
});

describe('Remote and In House payroll', () => {
  // Employee 20 (New Person) is In House from Mon 10/12; 10 (Paid Already) stays remote.
  beforeEach(() => {
    scheduleFindMany.mockResolvedValue([{ idUser: 20, schedule: 'inhouse', effectiveFrom: D('2026-10-12') }]);
    tx.payRun.findUnique.mockResolvedValue(null);
  });
  const get = (query: string) => GET(new Request(`http://localhost/api/admin/payroll/runs?${query}`));

  it('lists only remote employees on the Friday payroll', async () => {
    const body = await (await get('week=2026-10-20')).json();
    expect(body.run.periodStart).toBe('2026-10-16');
    expect(body.statements.map((s: { userId: number }) => s.userId)).toEqual([10]);
  });

  it('keeps the switching employee on the Friday payroll for their cut-short last remote week', async () => {
    const body = await (await get('week=2026-10-09')).json();
    expect(body.statements.map((s: { userId: number }) => s.userId)).toEqual([10, 20]);
  });

  it('lists only In House employees on the Monday payroll', async () => {
    const body = await (await get('week=2026-10-14&group=inhouse')).json();
    expect(body.run.periodStart).toBe('2026-10-12');
    expect(body.run.periodEnd).toBe('2026-10-16');
    expect(body.statements.map((s: { userId: number }) => s.userId)).toEqual([20]);
    expect(computePayStatement).toHaveBeenCalledWith(20, D('2026-10-12'));
  });

  it('refuses the In House week until it is over (it runs through Sunday)', async () => {
    expect((await approve({ period: '2026-10-12', group: 'inhouse' })).status).toBe(409);
  });

  it('approves the In House week as its own run, starting Monday', async () => {
    today.value = new Date('2026-10-19T00:00:00.000Z');
    const res = await approve({ period: '2026-10-12', group: 'inhouse' });
    expect(res.status).toBe(200);
    expect(tx.payRun.create.mock.calls[0][0].data).toMatchObject({ periodStart: D('2026-10-12'), periodEnd: D('2026-10-19') });
    expect(tx.payStatement.create).toHaveBeenCalledTimes(1);
    expect(tx.payStatement.create.mock.calls[0][0].data.idUser).toBe(20);
  });
});

describe('POST /api/admin/payroll/runs (approve)', () => {
  it('refuses to approve a period that is still running', async () => {
    today.value = new Date('2026-10-15T00:00:00.000Z'); // Thu, last day of the period
    const res = await approve();
    expect(res.status).toBe(409);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('never rewrites a statement that is already paid', async () => {
    const res = await approve();
    expect(res.status).toBe(200);
    // Employee 10's statement exists but the status-scoped update matched
    // nothing (it is paid): no new statement, and its lines are untouched.
    const linesFor = tx.payStatementLine.deleteMany.mock.calls.map((c) => c[0].where.idStatement);
    expect(linesFor).not.toContain(100);
    expect(linesFor).toEqual([200]);
    expect(tx.payStatement.create).toHaveBeenCalledTimes(1);
    // The database itself must enforce it: every per-employee update is
    // scoped to non-paid rows, not just guarded by an earlier read.
    const perEmployee = tx.payStatement.updateMany.mock.calls.filter((c) => c[0].data.status === 'pending');
    expect(perEmployee).toHaveLength(2);
    for (const [args] of perEmployee) expect(args.where.status).toEqual({ not: 'paid' });
  });

  it('voids unpaid statements of anyone no longer on this period\'s payroll', async () => {
    await approve();
    const voidCall = tx.payStatement.updateMany.mock.calls.find((c) => c[0].data.status === 'void');
    expect(voidCall?.[0].where).toEqual({ idPayRun: 7, status: { not: 'paid' }, idUser: { notIn: [10, 20] } });
  });

  it('includes a deactivated employee who worked in the period (final paycheck)', async () => {
    workedFindMany.mockResolvedValue([{ idUser: 30 }]);
    await approve();
    const where = usersFindMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ idUser: { in: [30] } });
  });

  it('refuses to re-approve a run that is already paid', async () => {
    tx.payRun.findUnique.mockResolvedValue({ idPayRun: 7, status: 'paid' });
    const res = await approve();
    expect(res.status).toBe(409);
    expect(tx.payRun.update).not.toHaveBeenCalled();
  });

  it('snapshots how many accounts / verified leads a bonus is for as its quantity', async () => {
    computePayStatement.mockResolvedValue({
      ...amounts,
      bonusAmounts: { ...amounts.bonusAmounts, accounts: 15, verifiedLeads: 20, reloads: 5 },
      bonusCounts: { accounts: 4, verifiedLeads: 1 },
    });
    await approve();
    const lines: { category: string | null; quantity: number | null }[] = tx.payStatementLine.createMany.mock.calls[0][0].data;
    const byCategory = Object.fromEntries(lines.map((l) => [l.category, l.quantity]));
    expect(byCategory).toMatchObject({ accounts: 4, verifiedLeads: 1, reloads: null });
  });

  it('writes everything inside one transaction', async () => {
    await approve();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.payRun.create).toHaveBeenCalledTimes(1);
  });
});
