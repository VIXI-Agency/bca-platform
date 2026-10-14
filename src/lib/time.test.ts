import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import {
  getPayPeriodStart,
  getPayPeriodEnd,
  getPayPeriodWorkDates,
  parseDateParam,
  payPeriodOptions,
  nowPstAsUtc,
  getTodayRangePST,
  minutesSinceStored,
} from './time';

const iso = (d: Date) => d.toISOString().split('T')[0];
/** A Date as the API routes build it from a "YYYY-MM-DD" week param. */
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const utcMidnight = (s: string) => new Date(`${s}T00:00:00.000Z`);

const originalTz = process.env.TZ;
const withTz = (tz: string) => {
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });
};

describe('getPayPeriodStart — local-date input (server in Pacific time)', () => {
  withTz('America/Los_Angeles');

  it.each([
    ['Fri', 9],
    ['Sat', 10],
    ['Sun', 11],
    ['Mon', 12],
    ['Tue', 13],
    ['Wed', 14],
    ['Thu', 15],
  ])('maps %s 2026-10-%i to Friday 2026-10-09', (_label, d) => {
    expect(iso(getPayPeriodStart(local(2026, 10, d)))).toBe('2026-10-09');
  });

  it('starts a new period on the following Friday', () => {
    expect(iso(getPayPeriodStart(local(2026, 10, 15)))).toBe('2026-10-09');
    expect(iso(getPayPeriodStart(local(2026, 10, 16)))).toBe('2026-10-16');
  });

  it('crosses a month boundary', () => {
    expect(iso(getPayPeriodStart(local(2026, 10, 1)))).toBe('2026-09-25');
  });

  it('crosses a year boundary', () => {
    expect(iso(getPayPeriodStart(local(2026, 12, 31)))).toBe('2026-12-25');
    expect(iso(getPayPeriodStart(local(2027, 1, 1)))).toBe('2027-01-01');
    expect(iso(getPayPeriodStart(local(2027, 1, 3)))).toBe('2027-01-01');
  });

  it('keeps Fri 10-30 .. Thu 11-05 together across the 2026-11-01 fall-back', () => {
    for (const [m, d] of [[10, 30], [10, 31], [11, 1], [11, 2], [11, 5]]) {
      expect(iso(getPayPeriodStart(local(2026, m, d)))).toBe('2026-10-30');
    }
    // 01:30 on 11-01 happens twice; both belong to the same period.
    expect(iso(getPayPeriodStart(new Date(2026, 10, 1, 1, 30)))).toBe('2026-10-30');
    expect(iso(getPayPeriodStart(local(2026, 11, 6)))).toBe('2026-11-06');
  });

  it('keeps the period together across the 2027-03-14 spring-forward', () => {
    expect(iso(getPayPeriodStart(local(2027, 3, 14)))).toBe('2027-03-12');
    expect(iso(getPayPeriodStart(local(2027, 3, 18)))).toBe('2027-03-12');
  });

  it('returns UTC midnight and leaves its input alone', () => {
    const input = new Date(2026, 9, 14, 15, 45);
    const before = input.getTime();
    const start = getPayPeriodStart(input);
    expect(start.toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(input.getTime()).toBe(before);
  });
});

describe('getPayPeriodStart — UTC-midnight input', () => {
  describe('server in UTC', () => {
    withTz('UTC');

    it('maps getTodayRangePST().todayStart on a Friday to that Friday', () => {
      expect(iso(getPayPeriodStart(utcMidnight('2026-10-16')))).toBe('2026-10-16');
      expect(iso(getPayPeriodStart(utcMidnight('2026-11-01')))).toBe('2026-10-30');
    });
  });

  describe('server in Pacific time', () => {
    withTz('America/Los_Angeles');
    afterEach(() => {
      vi.useRealTimers();
    });

    // Regression: getPayPeriodStart used to read LOCAL date fields, so on a
    // server west of UTC (production runs at UTC-5) Friday 00:00Z read as
    // Thursday and every Friday resolved to the PREVIOUS week's Friday.
    it('maps Friday todayStart to that Friday', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-16T16:00:00Z')); // Fri 2026-10-16 09:00 PDT
      const { todayStart } = getTodayRangePST();
      expect(iso(todayStart)).toBe('2026-10-16');
      expect(iso(getPayPeriodStart(todayStart))).toBe('2026-10-16');
    });

    it('maps the other weekdays correctly despite the offset', () => {
      // Mon..Thu are a day off locally too, but still within the same period.
      expect(iso(getPayPeriodStart(utcMidnight('2026-10-13')))).toBe('2026-10-09');
      expect(iso(getPayPeriodStart(utcMidnight('2026-11-02')))).toBe('2026-10-30');
    });
  });
});

describe('getPayPeriodWorkDates', () => {
  it('lists Fri, Mon, Tue, Wed, Thu of the period', () => {
    expect(getPayPeriodWorkDates(utcMidnight('2026-10-09'))).toEqual([
      '2026-10-09',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
    ]);
  });

  it('spans the 2026-11-01 DST change without skipping or repeating a day', () => {
    expect(getPayPeriodWorkDates(utcMidnight('2026-10-30'))).toEqual([
      '2026-10-30',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
  });

  it('spans a year boundary', () => {
    expect(getPayPeriodWorkDates(utcMidnight('2027-01-01'))).toEqual([
      '2027-01-01',
      '2027-01-04',
      '2027-01-05',
      '2027-01-06',
      '2027-01-07',
    ]);
  });
});

describe('nowPstAsUtc / getTodayRangePST', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const at = (instant: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(instant));
  };

  it.each([
    ['2026-10-14T13:15:30Z', '06:15:30'], // PDT, UTC-7
    ['2026-11-01T08:30:00Z', '01:30:00'], // first 01:30, still PDT
    ['2026-11-01T09:30:00Z', '01:30:00'], // second 01:30, now PST
    ['2026-11-02T14:00:00Z', '06:00:00'], // PST, UTC-8
    ['2026-10-15T07:00:05Z', '00:00:05'], // midnight is hour 0, not 24
  ])('maps %s to Pacific wall-clock %s on 1970-01-01', (instant, wall) => {
    at(instant);
    expect(nowPstAsUtc().toISOString()).toBe(`1970-01-01T${wall}.000Z`);
  });

  it.each([
    ['2026-10-17T05:00:00Z', '2026-10-16', '2026-10-17'], // Fri 22:00 PDT, still Friday
    ['2026-10-17T07:30:00Z', '2026-10-17', '2026-10-18'], // Sat 00:30 PDT
    ['2026-11-01T09:30:00Z', '2026-11-01', '2026-11-02'], // DST day
    ['2027-01-01T07:59:00Z', '2026-12-31', '2027-01-01'], // New Year's Eve 23:59 PST
  ])('at %s today runs from %s to %s (UTC midnights)', (instant, start, end) => {
    at(instant);
    const { todayStart, todayEnd } = getTodayRangePST();
    expect(todayStart.toISOString()).toBe(`${start}T00:00:00.000Z`);
    expect(todayEnd.toISOString()).toBe(`${end}T00:00:00.000Z`);
  });

  it('measures minutes since a stored time across midnight', () => {
    at('2026-10-15T07:10:00Z'); // 00:10 PDT
    expect(minutesSinceStored(new Date(Date.UTC(1970, 0, 1, 23, 50)))).toBe(20);
  });
});

describe('payPeriodOptions — the period picker on Payroll and Time Management', () => {
  describe('browser in Pacific time', () => {
    withTz('America/Los_Angeles');

    it('labels each period Friday through Thursday, with the Friday as its value', () => {
      const [current, previous] = payPeriodOptions(2, new Date(2026, 9, 14, 10)); // Wed Oct 14, 10am
      expect(current).toEqual({ value: '2026-10-09', label: 'Oct 9 - Oct 15, 2026' });
      expect(previous).toEqual({ value: '2026-10-02', label: 'Oct 2 - Oct 8, 2026' });
    });

    it('keeps the viewer on this week on a Thursday evening (after 00:00 UTC)', () => {
      const [current] = payPeriodOptions(1, new Date(2026, 9, 15, 19)); // Thu Oct 15, 7pm PDT
      expect(current.value).toBe('2026-10-09');
    });

    it('starts the new period on Friday morning', () => {
      const [current] = payPeriodOptions(1, new Date(2026, 9, 16, 6)); // Fri Oct 16, 6am
      expect(current.value).toBe('2026-10-16');
    });

    it('keeps every option on a Friday across the 2026-11-01 fall-back', () => {
      const values = payPeriodOptions(4, new Date(2026, 10, 13, 10)).map((o) => o.value);
      expect(values).toEqual(['2026-11-13', '2026-11-06', '2026-10-30', '2026-10-23']);
      for (const v of values) expect(parseDateParam(v).getUTCDay()).toBe(5);
    });
  });
});

describe('getPayPeriodEnd / parseDateParam', () => {
  withTz('America/Chicago'); // the production host's zone

  it('ends a period exactly seven days later, at the next Friday midnight UTC, across DST', () => {
    expect(getPayPeriodEnd(parseDateParam('2026-10-30')).toISOString()).toBe('2026-11-06T00:00:00.000Z');
    expect(getPayPeriodEnd(parseDateParam('2027-03-12')).toISOString()).toBe('2027-03-19T00:00:00.000Z');
  });

  it('maps every day of a period to its Friday from a week param, in any server zone', () => {
    for (const d of ['2026-10-09', '2026-10-12', '2026-10-15']) {
      expect(iso(getPayPeriodStart(parseDateParam(d)))).toBe('2026-10-09');
    }
  });
});
