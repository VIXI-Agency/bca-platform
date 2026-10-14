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

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { role: 1, userId: 1 } }) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => transaction(fn),
    employeeTimeLog: { findMany: (...a: unknown[]) => workedFindMany(...a) },
    user: { findMany: (...a: unknown[]) => usersFindMany(...a) },
  },
}));
vi.mock('@/lib/payroll/compute', () => ({
  computePayStatement: (...a: unknown[]) => computePayStatement(...a),
}));
vi.mock('@/lib/time', async () => ({
  ...(await vi.importActual<typeof import('@/lib/time')>('@/lib/time')),
  getTodayRangePST: () => ({ todayStart: today.value, todayEnd: new Date(today.value.getTime() + 86_400_000) }),
}));

const { POST } = await import('./route');

const approve = () =>
  POST(new Request('http://localhost/api/admin/payroll/runs', { method: 'POST', body: JSON.stringify({ period: '2026-10-09' }) }));

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
  tx.payRun.findUnique.mockResolvedValue(null);
  tx.payRun.create.mockResolvedValue({ idPayRun: 7 });
  tx.payStatement.updateMany.mockResolvedValue({ count: 0 });
  tx.payStatement.findUnique.mockImplementation(async (args: { where: { idPayRun_idUser: { idUser: number } } }) =>
    args.where.idPayRun_idUser.idUser === 10 ? { idStatement: 100 } : null,
  );
  tx.payStatement.create.mockResolvedValue({ idStatement: 200 });
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

  it('writes everything inside one transaction', async () => {
    await approve();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.payRun.create).toHaveBeenCalledTimes(1);
  });
});
