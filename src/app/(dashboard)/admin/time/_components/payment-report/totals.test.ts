/**
 * The Payment Report's live totals must match what Payroll snapshots on
 * approval (computePayStatement): same rounding to cents, overtime with no
 * OT rate paid as $0, and bonuses summed in. Each case runs the server
 * function against mocked rows and the client function against the same
 * hours, rates and bonuses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PERIOD_BONUS_FIELDS,
  type CountedBonusField,
  type DatedBonusCategory,
  type PeriodBonusField,
} from '@/lib/payroll/constants';

const timeLogFindMany = vi.fn();
const userFindUnique = vi.fn();
const bonusFindUnique = vi.fn();
const bonusEntryFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeTimeLog: { findMany: (...a: unknown[]) => timeLogFindMany(...a) },
    employeeDisconnection: { findMany: () => Promise.resolve([]) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    payrollBonus: { findUnique: (...a: unknown[]) => bonusFindUnique(...a) },
    payrollBonusEntry: { findMany: (...a: unknown[]) => bonusEntryFindMany(...a) },
    userPaySchedule: { findMany: () => Promise.resolve([]) },
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
  Object.fromEntries(PERIOD_BONUS_FIELDS.map((key) => [key, ''])) as Record<PeriodBonusField, string>;
const noDated = (): Record<DatedBonusCategory, number> => ({ wheelSpins: 0, ccfSpiffs: 0 });

interface Case {
  name: string;
  clockOuts: string[];
  payRate: string;
  otPayRate: string | null;
  bonus: Partial<Record<PeriodBonusField, number>>;
  /** How many accounts / verified leads, as typed (null = left blank). */
  counts?: Partial<Record<CountedBonusField, number | null>>;
  /** Dated entries (Wheel Spins, CCF Spiffs) as stored. */
  entries?: { category: DatedBonusCategory; amount: string }[];
}

const CASES: Case[] = [
  { name: 'regular hours only', clockOuts: ['14:30', '14:30'], payRate: '15.00', otPayRate: '22.50', bonus: {} },
  { name: 'daily overtime with an OT rate', clockOuts: ['16:30'], payRate: '10.00', otPayRate: '15.00', bonus: {} },
  { name: 'overtime with no OT rate (paid $0)', clockOuts: ['16:30'], payRate: '10.00', otPayRate: null, bonus: {} },
  { name: 'a rate that needs rounding to cents', clockOuts: ['13:30'], payRate: '15.3333', otPayRate: null, bonus: {} },
  { name: 'odd minutes and bonuses', clockOuts: ['14:37', '15:02', '13:11'], payRate: '7.00', otPayRate: '10.50', bonus: { discretionaryBonus: 25, accounts: 0.2 }, entries: [{ category: 'wheelSpins', amount: '0.10' }, { category: 'ccfSpiffs', amount: '5.00' }, { category: 'ccfSpiffs', amount: '2.55' }] },
  { name: 'counted bonuses, one count left blank', clockOuts: ['14:30'], payRate: '10.00', otPayRate: null, bonus: { accounts: 15, verifiedLeads: 20 }, counts: { accounts: 4, verifiedLeads: null } },
  { name: 'a count with no amount', clockOuts: ['14:30'], payRate: '10.00', otPayRate: null, bonus: {}, counts: { accounts: 3 } },
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
    bonusFindUnique.mockResolvedValue({
      ...c.bonus,
      accountsCount: c.counts?.accounts ?? null,
      verifiedLeadsCount: c.counts?.verifiedLeads ?? null,
    });
    bonusEntryFindMany.mockResolvedValue(c.entries ?? []);

    const server = await computePayStatement(USER, PERIOD);
    const hours = await computePeriodHours(USER, PERIOD);
    const bonusInputs = { ...noBonus() };
    for (const [key, value] of Object.entries(c.bonus)) bonusInputs[key as PeriodBonusField] = String(value);
    // What the report gets from the dated-entries endpoint, summed per category.
    const datedTotals = noDated();
    for (const e of c.entries ?? []) datedTotals[e.category] = Math.round((datedTotals[e.category] + Number(e.amount)) * 100) / 100;

    const client = computeReportTotals({
      totals: hours,
      payRateInput: c.payRate,
      otPayRateInput: c.otPayRate ?? '',
      bonusInputs,
      countInputs: {
        accounts: c.counts?.accounts != null ? String(c.counts.accounts) : '',
        verifiedLeads: c.counts?.verifiedLeads != null ? String(c.counts.verifiedLeads) : '',
      },
      datedTotals,
    });

    expect(client.bonusCounts).toEqual(server.bonusCounts);
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
      datedTotals: noDated(),
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
      datedTotals: noDated(),
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
      datedTotals: noDated(),
    });
    expect(r.payRate).toBeNull();
    expect(r.otPayRate).toBeNull();
    expect(r.bonusAmounts.discretionaryBonus).toBe(0);
    expect(r.bonusAmounts.collectionsBonus).toBe(0);
  });

  it('counts 1 when only the amount is typed, and nothing when only the count is', () => {
    const r = computeReportTotals({
      totals: { totalHours: 8, overtime: 0 },
      payRateInput: '10',
      otPayRateInput: '',
      bonusInputs: { ...noBonus(), accounts: '15' },
      countInputs: { accounts: '', verifiedLeads: '7' },
      datedTotals: noDated(),
    });
    expect(r.bonusCounts).toEqual({ accounts: 1, verifiedLeads: null });
    expect(r.bonusTotal).toBe(15);
  });

  it.each(['2.5', '-3', 'x'])('treats a count of %s as not typed', (count) => {
    const r = computeReportTotals({
      totals: { totalHours: 8, overtime: 0 },
      payRateInput: '10',
      otPayRateInput: '',
      bonusInputs: { ...noBonus(), accounts: '15' },
      countInputs: { accounts: count, verifiedLeads: '' },
      datedTotals: noDated(),
    });
    expect(r.bonusCounts.accounts).toBe(1);
  });

  it('has no amounts before the timesheet loads', () => {
    const r = computeReportTotals({
      totals: undefined,
      payRateInput: '10',
      otPayRateInput: '15',
      bonusInputs: noBonus(),
      datedTotals: noDated(),
    });
    expect(r.regularPay).toBeNull();
    expect(r.otPay).toBeNull();
    expect(r.totalPay).toBeNull();
  });
});
