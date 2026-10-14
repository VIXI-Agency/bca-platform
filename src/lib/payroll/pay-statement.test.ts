import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const timeLogFindMany = vi.fn();
const disconnectionFindMany = vi.fn();
const userFindUnique = vi.fn();
const bonusFindUnique = vi.fn();
const payRunFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeTimeLog: { findMany: (...a: unknown[]) => timeLogFindMany(...a) },
    employeeDisconnection: { findMany: (...a: unknown[]) => disconnectionFindMany(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    payrollBonus: { findUnique: (...a: unknown[]) => bonusFindUnique(...a) },
    payRun: { findUnique: (...a: unknown[]) => payRunFindUnique(...a) },
  },
}));

const {
  computePeriodHours,
  computePayStatement,
  fetchDisconnectionWindows,
  disconnectionKey,
  isPeriodLocked,
} = await import('./compute');

const USER = 7;
const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
};
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A time-log row: 06:00 to `clockOut`, 30-minute lunch, so 14:30 = 8h paid. */
const log = (iso: string, clockOut = '14:30') => ({
  idUser: USER,
  logDate: day(iso),
  clockIn: t('06:00'),
  firstBreakOut: null,
  firstBreakIn: null,
  lunchOut: t('10:00'),
  lunchIn: t('10:30'),
  secondBreakOut: null,
  secondBreakIn: null,
  clockOut: t(clockOut),
});

// Pay period starting Friday 2026-10-09: Fri 9, Mon 12 .. Thu 15.
const PERIOD = day('2026-10-09');
const WEEK = ['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];

/** Make findMany behave like the database: honour the logDate / disconnectionDate range. */
const inRange = <T>(rows: T[], dateOf: (r: T) => Date) =>
  (args: { where: Record<string, { gte: Date; lt: Date }> }) => {
    const range = Object.values(args.where).find((v) => v && typeof v === 'object' && 'gte' in v)!;
    return Promise.resolve(rows.filter((r) => dateOf(r) >= range.gte && dateOf(r) < range.lt));
  };

const setLogs = (rows: ReturnType<typeof log>[]) =>
  timeLogFindMany.mockImplementation(inRange(rows, (r) => r.logDate));

beforeEach(() => {
  vi.clearAllMocks();
  setLogs([]);
  disconnectionFindMany.mockResolvedValue([]);
  userFindUnique.mockResolvedValue({ payRate: '15.00', otPayRate: '22.50' });
  bonusFindUnique.mockResolvedValue(null);
});

describe('computePeriodHours', () => {
  it('sums five 8-hour weekdays into 40 regular hours', async () => {
    setLogs(WEEK.map((d) => log(d)));
    const h = await computePeriodHours(USER, PERIOD);
    expect(h.totalHours).toBe(40);
    expect(h.overtime).toBe(0);
  });

  it('keeps daily overtime per day instead of pooling hours', async () => {
    // A 9h day and a 7h day: still 1h of OT, and only 15 regular hours.
    setLogs([log('2026-10-12', '15:30'), log('2026-10-13', '13:30')]);
    const h = await computePeriodHours(USER, PERIOD);
    expect(h.totalHours).toBe(15);
    expect(h.overtime).toBe(1);
  });

  it('leaves Saturday and Sunday logs out', async () => {
    setLogs([log('2026-10-12'), log('2026-10-10'), log('2026-10-11')]);
    const h = await computePeriodHours(USER, PERIOD);
    expect(h.totalHours).toBe(8);
  });

  it('applies each disconnection only to the day it happened', async () => {
    setLogs([log('2026-10-12'), log('2026-10-13')]);
    disconnectionFindMany.mockResolvedValue([
      { idUser: USER, disconnectionDate: day('2026-10-13'), disconnectionTime: t('09:00'), reconnectionTime: t('09:30') },
    ]);
    const h = await computePeriodHours(USER, PERIOD);
    expect(h.disconnectedMinutes).toBe(30);
    expect(h.totalHours).toBe(15.5);
  });

  it('queries only this employee', async () => {
    await computePeriodHours(USER, PERIOD);
    expect(timeLogFindMany.mock.calls[0][0].where.idUser).toBe(USER);
    expect(disconnectionFindMany.mock.calls[0][0].where.idUser).toBe(USER);
  });

  it('returns zeros for a period with no logs', async () => {
    const h = await computePeriodHours(USER, PERIOD);
    expect(h).toEqual({ totalHours: 0, overtime: 0, firstBreakExcess: 0, secondBreakExcess: 0, disconnectedMinutes: 0 });
  });
});

describe('computePeriodHours — period boundary across the 2026-11-01 DST change', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  // Period Fri 2026-10-30 .. Thu 2026-11-05, then the NEXT period starts Fri 11-06.
  const rows = [
    ...['2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => log(d)),
    log('2026-11-06'),
  ];

  it('excludes the next Friday when the server runs in UTC', async () => {
    process.env.TZ = 'UTC';
    setLogs(rows);
    const h = await computePeriodHours(USER, day('2026-10-30'));
    expect(h.totalHours).toBe(40);
  });

  // Regression: periodEnd used local-time setDate(+7). On a server in a US
  // time zone, 2026-10-30T00:00Z + 7 local days crossed the fall-back and
  // landed on 2026-11-06T01:00Z, so the next Friday was paid in BOTH periods.
  it('excludes the next Friday when the server runs in Pacific time', async () => {
    process.env.TZ = 'America/Los_Angeles';
    setLogs(rows);
    const h = await computePeriodHours(USER, day('2026-10-30'));
    expect(h.totalHours).toBe(40);
  });
});

describe('computePayStatement', () => {
  it('multiplies regular and overtime hours by their rates and adds every bonus', async () => {
    setLogs([...WEEK.slice(0, 4).map((d) => log(d)), log('2026-10-15', '16:00')]); // 32h + 9.5h
    userFindUnique.mockResolvedValue({ payRate: '15.50', otPayRate: '23.25' });
    bonusFindUnique.mockResolvedValue({
      discretionaryBonus: '50.00',
      collectionsBonus: '25.50',
      trainingBonus: '10.00',
      managerBonus: '5.25',
      wheelSpins: '3.00',
      accounts: '2.00',
      reloads: '1.10',
      verifiedLeads: '0.15',
    });

    const s = await computePayStatement(USER, PERIOD);

    expect(s.regularHours).toBe(40);
    expect(s.overtimeHours).toBe(1.5);
    expect(s.payRate).toBe(15.5);
    expect(s.otPayRate).toBe(23.25);
    expect(s.regularPay).toBe(620);
    expect(s.overtimePay).toBe(34.88); // 1.5 * 23.25 = 34.875
    expect(s.bonusTotal).toBe(97);
    expect(s.bonusAmounts).toEqual({
      discretionaryBonus: 50,
      collectionsBonus: 25.5,
      trainingBonus: 10,
      managerBonus: 5.25,
      wheelSpins: 3,
      accounts: 2,
      reloads: 1.1,
      verifiedLeads: 0.15,
    });
    expect(s.grossPay).toBe(751.88);
  });

  it('pays overtime at the OT rate, not the regular rate', async () => {
    setLogs([log('2026-10-12', '16:30')]); // 10h: 8 + 2 OT
    userFindUnique.mockResolvedValue({ payRate: '10.00', otPayRate: '15.00' });
    const s = await computePayStatement(USER, PERIOD);
    expect(s.regularPay).toBe(80);
    expect(s.overtimePay).toBe(30);
    expect(s.grossPay).toBe(110);
  });

  it('rounds pay to cents', async () => {
    setLogs([log('2026-10-12', '13:30')]); // 7h
    userFindUnique.mockResolvedValue({ payRate: '15.3333', otPayRate: null });
    const s = await computePayStatement(USER, PERIOD);
    expect(s.regularPay).toBe(107.33);
    expect(s.grossPay).toBe(107.33);
  });

  it('pays no regular wages when the employee has no pay rate', async () => {
    setLogs([log('2026-10-12', '16:30')]);
    userFindUnique.mockResolvedValue({ payRate: null, otPayRate: '15.00' });
    const s = await computePayStatement(USER, PERIOD);
    expect(s.payRate).toBeNull();
    expect(s.regularPay).toBe(0);
    expect(s.overtimePay).toBe(30);
    expect(s.grossPay).toBe(30);
  });

  it('pays no overtime when the employee has no OT rate', async () => {
    setLogs([log('2026-10-12', '16:30')]);
    userFindUnique.mockResolvedValue({ payRate: '10.00', otPayRate: null });
    const s = await computePayStatement(USER, PERIOD);
    expect(s.otPayRate).toBeNull();
    expect(s.overtimeHours).toBe(2);
    expect(s.overtimePay).toBe(0);
    expect(s.grossPay).toBe(80);
  });

  it('pays no overtime when there are no OT hours', async () => {
    setLogs(WEEK.map((d) => log(d)));
    const s = await computePayStatement(USER, PERIOD);
    expect(s.overtimePay).toBe(0);
    expect(s.regularPay).toBe(600);
  });

  it('handles a user record that does not exist', async () => {
    setLogs([log('2026-10-12')]);
    userFindUnique.mockResolvedValue(null);
    const s = await computePayStatement(USER, PERIOD);
    expect(s.payRate).toBeNull();
    expect(s.otPayRate).toBeNull();
    expect(s.grossPay).toBe(0);
  });

  it('counts missing and null bonus fields as zero', async () => {
    bonusFindUnique.mockResolvedValue({ discretionaryBonus: '12.34', collectionsBonus: null });
    const s = await computePayStatement(USER, PERIOD);
    expect(s.bonusAmounts.discretionaryBonus).toBe(12.34);
    expect(s.bonusAmounts.collectionsBonus).toBe(0);
    expect(s.bonusAmounts.verifiedLeads).toBe(0);
    expect(s.bonusTotal).toBe(12.34);
    expect(s.grossPay).toBe(12.34);
  });

  it('rounds the bonus total to cents', async () => {
    bonusFindUnique.mockResolvedValue({ discretionaryBonus: 0.1, collectionsBonus: 0.2 });
    const s = await computePayStatement(USER, PERIOD);
    expect(s.bonusTotal).toBe(0.3);
  });

  it('looks up the bonus row for this employee and period', async () => {
    await computePayStatement(USER, PERIOD);
    expect(bonusFindUnique.mock.calls[0][0].where).toEqual({
      idUser_periodStart: { idUser: USER, periodStart: PERIOD },
    });
    expect(userFindUnique.mock.calls[0][0].where).toEqual({ idUser: USER });
  });
});

describe('fetchDisconnectionWindows', () => {
  it('groups windows by employee and day', async () => {
    disconnectionFindMany.mockResolvedValue([
      { idUser: 1, disconnectionDate: day('2026-10-12'), disconnectionTime: t('09:00'), reconnectionTime: t('09:10') },
      { idUser: 1, disconnectionDate: day('2026-10-12'), disconnectionTime: t('11:00'), reconnectionTime: null },
      { idUser: 2, disconnectionDate: day('2026-10-12'), disconnectionTime: t('08:00'), reconnectionTime: t('08:05') },
    ]);
    const map = await fetchDisconnectionWindows(day('2026-10-09'), day('2026-10-16'));
    expect(map.get(disconnectionKey(1, day('2026-10-12')))).toEqual([
      { start: t('09:00'), end: t('09:10') },
      { start: t('11:00'), end: null },
    ]);
    expect(map.get(disconnectionKey(2, day('2026-10-12')))).toHaveLength(1);
    expect(disconnectionFindMany.mock.calls[0][0].where).toEqual({
      disconnectionDate: { gte: day('2026-10-09'), lt: day('2026-10-16') },
    });
  });

  it('builds keys from the UTC calendar date', () => {
    expect(disconnectionKey(42, day('2026-11-01'))).toBe('42|2026-11-01');
  });
});

describe('isPeriodLocked', () => {
  it.each([
    ['approved', true],
    ['paid', true],
    ['void', false],
  ])('treats a %s pay run as locked=%s', async (status, locked) => {
    payRunFindUnique.mockResolvedValue({ status });
    expect(await isPeriodLocked(PERIOD)).toBe(locked);
  });

  it('is unlocked when no pay run exists', async () => {
    payRunFindUnique.mockResolvedValue(null);
    expect(await isPeriodLocked(PERIOD)).toBe(false);
  });
});
