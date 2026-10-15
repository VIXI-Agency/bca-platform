import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { computeDayMetrics, type TimeLogRow, type DisconnectionWindow } from './compute';

// TIME columns come back as 1970-01-01 dates whose UTC fields hold the
// Pacific wall-clock time.
const t = (hhmmss: string) => {
  const [h, m, s = 0] = hhmmss.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, s));
};

const shift = (over: Partial<Record<keyof TimeLogRow, string | null>> = {}): TimeLogRow => {
  const base: Record<keyof TimeLogRow, string | null> = {
    clockIn: '06:00:00',
    firstBreakOut: '08:00:00',
    firstBreakIn: '08:10:00',
    lunchOut: '10:00:00',
    lunchIn: '10:30:00',
    secondBreakOut: '12:30:00',
    secondBreakIn: '12:40:00',
    clockOut: '14:30:00',
    ...over,
  };
  return Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, v ? t(v) : null]),
  ) as unknown as TimeLogRow;
};

const win = (start: string, end: string | null): DisconnectionWindow => ({
  start: t(start),
  end: end ? t(end) : null,
});

describe('computeDayMetrics — disconnections', () => {
  it('leaves a normal 8h day untouched when there are no disconnections', () => {
    const m = computeDayMetrics(shift());
    expect(m.totalHours).toBe(8);
    expect(m.overtime).toBe(0);
    expect(m.disconnectedMinutes).toBe(0);
  });

  it("deducts Richard Grant's 16-minute disconnection on 2026-10-13", () => {
    const log = shift({
      clockIn: '05:50:00',
      firstBreakOut: '08:01:57',
      firstBreakIn: '08:11:49',
      lunchOut: '10:25:31',
      lunchIn: '10:58:18',
      secondBreakOut: '12:47:11',
      secondBreakIn: '12:59:11',
      clockOut: '15:02:11',
    });

    const before = computeDayMetrics(log);
    const after = computeDayMetrics(log, [win('08:54:28', '09:10:28')]);

    expect(after.disconnectedMinutes).toBe(16);
    const paidBefore = before.totalHours + before.overtime;
    const paidAfter = after.totalHours + after.overtime;
    expect(paidBefore - paidAfter).toBeCloseTo(16 / 60, 1);
  });

  it('runs a never-reconnected disconnection until clock-out', () => {
    const m = computeDayMetrics(shift(), [win('13:30:00', null)]);
    expect(m.disconnectedMinutes).toBe(60);
    expect(m.totalHours).toBe(7);
  });

  it('does not deduct the part of a disconnection that overlaps lunch', () => {
    // 09:50-10:40 overlaps the 10:00-10:30 lunch; only 20 minutes are lost.
    const m = computeDayMetrics(shift(), [win('09:50:00', '10:40:00')]);
    expect(m.disconnectedMinutes).toBe(20);
  });

  it('merges overlapping disconnections instead of counting minutes twice', () => {
    const m = computeDayMetrics(shift(), [win('09:00:00', '09:30:00'), win('09:15:00', '09:45:00')]);
    expect(m.disconnectedMinutes).toBe(45);
  });

  it('clips disconnections to the clocked-in shift', () => {
    const m = computeDayMetrics(shift(), [win('05:30:00', '06:15:00'), win('14:20:00', '15:00:00')]);
    expect(m.disconnectedMinutes).toBe(25);
  });

  it('deducts nothing while the day is still open (no clock-out)', () => {
    const m = computeDayMetrics(shift({ clockOut: null }), [win('09:00:00', '09:30:00')]);
    expect(m.totalHours).toBe(0);
    expect(m.disconnectedMinutes).toBe(0);
  });

  it('still pays breaks over 10 minutes in full', () => {
    const m = computeDayMetrics(shift({ firstBreakIn: '08:40:00' }));
    expect(m.firstBreakExcess).toBe(30);
    expect(m.totalHours).toBe(8);
  });

  it('counts a window fully inside another once, at the outer length', () => {
    const m = computeDayMetrics(shift(), [win('09:00:00', '10:00:00'), win('09:15:00', '09:30:00')]);
    expect(m.disconnectedMinutes).toBe(60);
    expect(m.totalHours).toBe(7);
  });

  it('merges windows given out of order', () => {
    const m = computeDayMetrics(shift(), [win('11:15:00', '11:45:00'), win('11:00:00', '11:30:00')]);
    expect(m.disconnectedMinutes).toBe(45);
  });

  it('sums separate windows that do not overlap', () => {
    const m = computeDayMetrics(shift(), [win('07:00:00', '07:10:00'), win('11:00:00', '11:20:00')]);
    expect(m.disconnectedMinutes).toBe(30);
    expect(m.totalHours).toBe(7.5);
  });

  it('deducts nothing for a disconnection that lies entirely inside lunch', () => {
    const m = computeDayMetrics(shift(), [win('10:05:00', '10:25:00')]);
    expect(m.disconnectedMinutes).toBe(0);
    expect(m.totalHours).toBe(8);
  });

  it('deducts a disconnection outside the shift as zero', () => {
    const m = computeDayMetrics(shift(), [win('15:00:00', '16:00:00')]);
    expect(m.disconnectedMinutes).toBe(0);
    expect(m.totalHours).toBe(8);
  });

  it('treats a reconnect earlier than the disconnect as past midnight, so it runs to clock-out', () => {
    // Disconnected 13:00, "reconnected" 12:00 = 12:00 the next day; the shift
    // ends at 14:30, so 90 minutes are lost.
    const m = computeDayMetrics(shift(), [win('13:00:00', '12:00:00')]);
    expect(m.disconnectedMinutes).toBe(90);
    expect(m.totalHours).toBe(6.5);
  });

  it('runs a never-reconnected disconnection that began before clock-in for the whole shift', () => {
    // 06:00-14:30 is 510 minutes; the 30-minute lunch is already unpaid.
    const m = computeDayMetrics(shift(), [win('05:30:00', null)]);
    expect(m.disconnectedMinutes).toBe(480);
    expect(m.totalHours).toBe(0);
    expect(m.overtime).toBe(0);
  });

  it('never reports negative hours when bad punches make lunch longer than the shift', () => {
    const m = computeDayMetrics(shift({ lunchOut: '05:00:00', lunchIn: '14:45:00' }));
    expect(m.totalHours).toBe(0);
    expect(m.overtime).toBe(0);
  });
});

describe('computeDayMetrics — paid hours and daily overtime', () => {
  it('deducts lunch but not breaks', () => {
    // 06:00-15:00 = 9h, minus a 60-minute lunch.
    const m = computeDayMetrics(shift({ lunchOut: '10:00:00', lunchIn: '11:00:00', clockOut: '15:00:00' }));
    expect(m.lunchDurationMinutes).toBe(60);
    expect(m.totalHours).toBe(8);
    expect(m.overtime).toBe(0);
  });

  it('pays the full span when no lunch was taken', () => {
    const m = computeDayMetrics(shift({ lunchOut: null, lunchIn: null, clockOut: '13:00:00' }));
    expect(m.lunchDurationMinutes).toBe(0);
    expect(m.totalHours).toBe(7);
  });

  it('ignores a lunch that was started but never ended', () => {
    const m = computeDayMetrics(shift({ lunchIn: null, clockOut: '13:00:00' }));
    expect(m.totalHours).toBe(7);
  });

  it('caps regular hours at 8 and moves the rest to overtime', () => {
    // 06:00-15:30 minus 30-minute lunch = 9h.
    const m = computeDayMetrics(shift({ clockOut: '15:30:00' }));
    expect(m.totalHours).toBe(8);
    expect(m.overtime).toBe(1);
  });

  it('puts a long day into overtime minute for minute', () => {
    // 06:00-18:45 minus 30-minute lunch = 12.25h.
    const m = computeDayMetrics(shift({ clockOut: '18:45:00' }));
    expect(m.totalHours).toBe(8);
    expect(m.overtime).toBe(4.25);
  });

  it('gives no overtime at exactly 8 hours', () => {
    const m = computeDayMetrics(shift());
    expect(m.totalHours).toBe(8);
    expect(m.overtime).toBe(0);
  });

  it('starts overtime one minute past 8 hours', () => {
    const m = computeDayMetrics(shift({ clockOut: '14:31:00' }));
    expect(m.totalHours).toBe(8);
    expect(m.overtime).toBe(0.02);
  });

  it('can bring an overtime day back under 8 hours through a disconnection', () => {
    const m = computeDayMetrics(shift({ clockOut: '15:30:00' }), [win('09:00:00', '10:00:00')]);
    expect(m.totalHours).toBe(8);
    expect(m.overtime).toBe(0);
  });

  it('pays nothing without a clock-in', () => {
    const m = computeDayMetrics(shift({ clockIn: null }));
    expect(m.totalHours).toBe(0);
    expect(m.overtime).toBe(0);
    expect(m.lunchDurationMinutes).toBe(0);
  });

  it('pays nothing without a clock-out even on a long open day', () => {
    const m = computeDayMetrics(shift({ clockOut: null, lunchOut: null, lunchIn: null }));
    expect(m.totalHours).toBe(0);
    expect(m.overtime).toBe(0);
  });

  // There are no overnight shifts: a clock-out at or before clock-in is a bad
  // punch, and it used to be paid as a ~24h day (8 regular + 15.5 OT).
  it('pays nothing when clock-out equals clock-in', () => {
    const m = computeDayMetrics(shift({ clockOut: '06:00:00' }));
    expect(m.totalHours + m.overtime).toBe(0);
  });
});

describe('computeDayMetrics — whole minutes (seconds are dropped)', () => {
  it('pays 8h for a 6:00–2:30 day clocked in at 6:00:19 (Drew Hayes, Oct 9)', () => {
    const m = computeDayMetrics(shift({ clockIn: '06:00:19', firstBreakOut: null, firstBreakIn: null, secondBreakOut: null, secondBreakIn: null }));
    expect(m.totalHours).toBe(8);
  });

  it('counts a 10:02:47–10:33:20 lunch as 31 minutes, not 30m 33s (Drew Hayes, Oct 14)', () => {
    const m = computeDayMetrics(shift({ lunchOut: '10:02:47', lunchIn: '10:33:20' }));
    expect(m.lunchDurationMinutes).toBe(31);
    expect(m.totalHours).toBe(7.98); // 8h30 shift − 31 min lunch = 7h59m
  });

  it('drops seconds from clock-out too (2:30:59 counts as 2:30)', () => {
    expect(computeDayMetrics(shift({ clockOut: '14:30:59' })).totalHours).toBe(8);
  });

  it('pays the same with or without seconds on every punch', () => {
    const withSeconds = computeDayMetrics(shift({
      clockIn: '06:00:45', firstBreakOut: '08:00:12', firstBreakIn: '08:10:58',
      lunchOut: '10:00:01', lunchIn: '10:30:59', secondBreakOut: '12:30:30', secondBreakIn: '12:40:30',
      clockOut: '16:30:44',
    }));
    expect(withSeconds).toEqual(computeDayMetrics(shift({ clockOut: '16:30:00' })));
  });

  it('counts disconnections in whole minutes as well', () => {
    const m = computeDayMetrics(shift(), [win('08:54:40', '09:10:20')]);
    expect(m.disconnectedMinutes).toBe(16); // 8:54 → 9:10
  });

  it('pays nothing when clock-in and clock-out fall in the same minute', () => {
    const m = computeDayMetrics(shift({ clockIn: '06:00:10', clockOut: '06:00:50', lunchOut: null, lunchIn: null }));
    expect(m.totalHours + m.overtime).toBe(0);
  });
});

describe('computeDayMetrics — clock-out before clock-in (no overnight shifts)', () => {
  it('pays nothing for a 2:00 typo meant as 2:00 PM (real 2024-12-16 row)', () => {
    const m = computeDayMetrics(shift({ clockIn: '06:02:20', lunchOut: '09:59:56', lunchIn: '10:30:00', clockOut: '02:00:00' }));
    expect(m.totalHours).toBe(0);
    expect(m.overtime).toBe(0);
  });

  it('pays nothing for the clock-out-before-snapped-clock-in exploit', () => {
    // Punched in at 05:00 (stored 06:00), every action in the next minute,
    // clocked out at 05:01: previously 8 regular + ~15 overtime.
    const m = computeDayMetrics(shift({
      clockIn: '06:00:00',
      firstBreakOut: '05:00:10', firstBreakIn: '05:00:20',
      lunchOut: null, lunchIn: null,
      secondBreakOut: '05:00:30', secondBreakIn: '05:00:40',
      clockOut: '05:01:00',
    }));
    expect(m.totalHours + m.overtime).toBe(0);
  });

  it('deducts no disconnection time on such a day (there are no paid hours to deduct from)', () => {
    const m = computeDayMetrics(shift({ clockOut: '05:00:00' }), [win('09:00:00', '09:30:00')]);
    expect(m.disconnectedMinutes).toBe(0);
    expect(m.totalHours).toBe(0);
  });
});
