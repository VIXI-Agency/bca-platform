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
});
