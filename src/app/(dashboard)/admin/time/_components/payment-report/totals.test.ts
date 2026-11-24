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
const customBonusFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeTimeLog: { findMany: (...a: unknown[]) => timeLogFindMany(...a) },
    employeeDisconnection: { findMany: () => Promise.resolve([]) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    payrollBonus: { findUnique: (...a: unknown[]) => bonusFindUnique(...a) },
    payrollBonusEntry: { findMany: (...a: unknown[]) => bonusEntryFindMany(...a) },
    payrollCustomBonus: { findMany: (...a: unknown[]) => customBonusFindMany(...a) },
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
const noDated = (): Record<DatedBonusCategory, number> => ({ holidayPay: 0, wheelSpins: 0, ccfSpiffs: 0 });

interface Case {
  name: string;
  clockOuts: string[];
  payRate: string;
  otPayRate: string | null;
  bonus: Partial<Record<PeriodBonusField, number>>;
  /** How many accounts / verified leads, as typed (null = left blank). */
  counts?: Partial<Record<CountedBonusField, number | null>>;
  /** Holiday hours per dated entry, as stored (paid at the regular rate). */
  holidayHours?: number[];
  /** Custom bonus amounts as stored ("Raffle", "Birthday Bonus"). */
  custom?: string[];
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
  { name: 'holiday hours at a rate that needs rounding', clockOuts: ['14:30'], payRate: '7.33', otPayRate: '11.00', bonus: { managerBonus: 5 }, holidayHours: [8] },
  { name: 'holiday hours on top of an overtime day', clockOuts: ['16:30'], payRate: '10.00', otPayRate: '15.00', bonus: {}, holidayHours: [8, 8] },
  { name: 'holiday days whose per-day cents would round differently', clockOuts: ['14:30'], payRate: '7.333', otPayRate: null, bonus: {}, holidayHours: [3, 3], entries: [{ category: 'wheelSpins', amount: '7.00' }] },
  { name: 'custom bonuses with cents, next to a typed bonus', clockOuts: ['14:37'], payRate: '7.33', otPayRate: null, bonus: { managerBonus: 5 }, custom: ['50.00', '0.10', '0.20'] },
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
    const holidayEntries = (c.holidayHours ?? []).map((hours) => ({ category: 'holidayPay', amount: '0.00', hours }));
    bonusEntryFindMany.mockResolvedValue([...(c.entries ?? []), ...holidayEntries]);

    customBonusFindMany.mockResolvedValue((c.custom ?? []).map((amount, i) => ({ name: `Custom ${i}`, amount })));

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
      datedHours: { holidayPay: (c.holidayHours ?? []).reduce((sum, h) => sum + h, 0) },
      customAmounts: (c.custom ?? []).map(Number),
    });

    expect(client.bonusHours).toEqual(server.bonusHours);
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

  describe('Holiday Pay', () => {
    const holiday = (hours: number | undefined, payRateInput = '7') =>
      computeReportTotals({
        totals: { totalHours: 8, overtime: 0 },
        payRateInput,
        otPayRateInput: '',
        bonusInputs: noBonus(),
        datedTotals: noDated(),
        datedHours: hours != null ? { holidayPay: hours } : undefined,
      });

    it('pays the entered hours at the typed rate, before the rate is saved', () => {
      const r = holiday(8);
      expect(r.bonusHours.holidayPay).toBe(8);
      expect(r.bonusAmounts.holidayPay).toBe(56);
      expect(r.totalPay).toBe(112); // 8 h worked + 8 h holiday at $7.00
    });

    it('follows the rate as it is retyped', () => {
      expect(holiday(8, '9.5').bonusAmounts.holidayPay).toBe(76);
    });

    it('has no business cap', () => {
      expect(holiday(40).bonusAmounts.holidayPay).toBe(280);
    });

    it.each([undefined, 0])('pays nothing with no holiday entries (%s)', (hours) => {
      const r = holiday(hours);
      expect(r.bonusHours.holidayPay).toBeNull();
      expect(r.bonusAmounts.holidayPay).toBe(0);
      expect(r.totalPay).toBe(56);
    });

    it('pays nothing without a pay rate', () => {
      expect(holiday(8, '').bonusAmounts.holidayPay).toBe(0);
    });
  });

  it('adds custom bonuses to Total Payment', () => {
    const r = computeReportTotals({
      totals: { totalHours: 8, overtime: 0 },
      payRateInput: '10',
      otPayRateInput: '',
      bonusInputs: noBonus(),
      datedTotals: noDated(),
      customAmounts: [50, 25.5],
    });
    expect(r.bonusTotal).toBe(75.5);
    expect(r.totalPay).toBe(155.5);
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
