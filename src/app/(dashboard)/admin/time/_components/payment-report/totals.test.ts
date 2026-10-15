/**
 * The Payment Report's live totals must match what Payroll snapshots on
 * approval (computePayStatement): same rounding to cents, overtime with no
 * OT rate paid as $0, and bonuses summed in. Each case runs the server
 * function against mocked rows and the client function against the same
 * hours, rates and bonuses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BONUS_FIELDS, type BonusFieldKey } from '@/hooks/use-admin-time';

const timeLogFindMany = vi.fn();
const userFindUnique = vi.fn();
const bonusFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeTimeLog: { findMany: (...a: unknown[]) => timeLogFindMany(...a) },
    employeeDisconnection: { findMany: () => Promise.resolve([]) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    payrollBonus: { findUnique: (...a: unknown[]) => bonusFindUnique(...a) },
  },
}));

const { computePeriodHours, computePayStatement } = await import('@/lib/payroll/compute');
const { computeReportTotals } = await import('./totals');

const USER = 7;
const PERIOD = new Date('2026-10-09T00:00:00.000Z');
const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
};
/** 06:00 to `clockOut` with a 30-minute lunch, so 14:30 is an 8-hour day. */
const log = (iso: string, clockOut: string) => ({
  idUser: USER,
  logDate: new Date(`${iso}T00:00:00.000Z`),
  clockIn: t('06:00'),
  firstBreakOut: null,
  firstBreakIn: null,
  lunchOut: t('10:00'),
  lunchIn: t('10:30'),
  secondBreakOut: null,
  secondBreakIn: null,
  clockOut: t(clockOut),
});

const noBonus = () =>
  Object.fromEntries(BONUS_FIELDS.map((key) => [key, ''])) as Record<BonusFieldKey, string>;

interface Case {
  name: string;
  clockOuts: string[];
  payRate: string;
  otPayRate: string | null;
  bonus: Partial<Record<BonusFieldKey, number>>;
}

const CASES: Case[] = [
  { name: 'regular hours only', clockOuts: ['14:30', '14:30'], payRate: '15.00', otPayRate: '22.50', bonus: {} },
  { name: 'daily overtime with an OT rate', clockOuts: ['16:30'], payRate: '10.00', otPayRate: '15.00', bonus: {} },
  { name: 'overtime with no OT rate (paid $0)', clockOuts: ['16:30'], payRate: '10.00', otPayRate: null, bonus: {} },
  { name: 'a rate that needs rounding to cents', clockOuts: ['13:30'], payRate: '15.3333', otPayRate: null, bonus: {} },
  { name: 'odd minutes and bonuses', clockOuts: ['14:37', '15:02', '13:11'], payRate: '7.00', otPayRate: '10.50', bonus: { discretionaryBonus: 25, wheelSpins: 0.1, accounts: 0.2 } },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeReportTotals', () => {
  it.each(CASES)('matches computePayStatement: $name', async (c) => {
    const days = ['2026-10-12', '2026-10-13', '2026-10-14'];
    const rows = c.clockOuts.map((out, i) => log(days[i], out));
    timeLogFindMany.mockResolvedValue(rows);
    userFindUnique.mockResolvedValue({ payRate: c.payRate, otPayRate: c.otPayRate });
    bonusFindUnique.mockResolvedValue(c.bonus);

    const server = await computePayStatement(USER, PERIOD);
    const hours = await computePeriodHours(USER, PERIOD);
    const bonusInputs = { ...noBonus() };
    for (const [key, value] of Object.entries(c.bonus)) bonusInputs[key as BonusFieldKey] = String(value);

    const client = computeReportTotals({
      totals: hours,
      payRateInput: c.payRate,
      otPayRateInput: c.otPayRate ?? '',
      bonusInputs,
    });

    expect(client.regularPay).toBe(server.regularPay);
    expect(client.otPay).toBe(server.overtimePay);
    expect(client.bonusAmounts).toEqual(server.bonusAmounts);
    expect(client.bonusTotal).toBe(server.bonusTotal);
    expect(client.totalPay).toBe(server.grossPay);
  });

  it('flags overtime that has no OT rate', () => {
    const r = computeReportTotals({
      totals: { totalHours: 8, overtime: 2 },
      payRateInput: '10',
      otPayRateInput: '',
      bonusInputs: noBonus(),
    });
    expect(r.otRateMissing).toBe(true);
    expect(r.otPay).toBe(0);
    expect(r.totalPay).toBe(80);
  });

  it('shows no total until a pay rate is entered', () => {
    const r = computeReportTotals({
      totals: { totalHours: 8, overtime: 0 },
      payRateInput: '',
      otPayRateInput: '15',
      bonusInputs: noBonus(),
    });
    expect(r.payRate).toBeNull();
    expect(r.regularPay).toBeNull();
    expect(r.totalPay).toBeNull();
  });

  it('ignores negative and non-numeric input', () => {
    const r = computeReportTotals({
      totals: { totalHours: 8, overtime: 0 },
      payRateInput: '-5',
      otPayRateInput: 'abc',
      bonusInputs: { ...noBonus(), discretionaryBonus: '-10', collectionsBonus: 'x' },
    });
    expect(r.payRate).toBeNull();
    expect(r.otPayRate).toBeNull();
    expect(r.bonusAmounts.discretionaryBonus).toBe(0);
    expect(r.bonusAmounts.collectionsBonus).toBe(0);
  });

  it('has no amounts before the timesheet loads', () => {
    const r = computeReportTotals({
      totals: undefined,
      payRateInput: '10',
      otPayRateInput: '15',
      bonusInputs: noBonus(),
    });
    expect(r.regularPay).toBeNull();
    expect(r.otPay).toBeNull();
    expect(r.totalPay).toBeNull();
  });
});
