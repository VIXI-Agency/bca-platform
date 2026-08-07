import { describe, it, expect, vi } from 'vitest';

// Imported for its Prisma queries, which these cases do not exercise; without
// the mock the module instantiates a client just to read two pure functions.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

const { centralDayKey, digestDayFor, formatDayKey } = await import('./scrape-digest');

describe('centralDayKey', () => {
  it('uses the Central date, not the UTC one', () => {
    // 04:00 UTC on the 7th is 23:00 CDT on the 6th, and the report belongs to
    // the 6th. Runs finish overnight, so this is the common case, not an edge.
    expect(centralDayKey(new Date('2026-08-07T04:00:00Z'))).toBe('2026-08-06');
  });

  it('rolls over at Central midnight', () => {
    expect(centralDayKey(new Date('2026-08-07T05:00:00Z'))).toBe('2026-08-07');
  });

  it('follows the standard-time offset in winter', () => {
    // CST is UTC-6, so the same 05:00 UTC that starts a summer day is still
    // 23:00 the night before in January.
    expect(centralDayKey(new Date('2026-01-07T05:00:00Z'))).toBe('2026-01-06');
    expect(centralDayKey(new Date('2026-01-07T06:00:00Z'))).toBe('2026-01-07');
  });
});

describe('digestDayFor', () => {
  it('sends nothing when there is no previous run', () => {
    expect(digestDayFor(null, new Date('2026-08-07T08:00:00Z'))).toBeNull();
  });

  it('sends nothing while runs stay inside one Central day', () => {
    const previous = new Date('2026-08-06T14:00:00Z');
    const current = new Date('2026-08-06T20:00:00Z');
    expect(digestDayFor(previous, current)).toBeNull();
  });

  it('claims the previous day when the run crosses Central midnight', () => {
    const previous = new Date('2026-08-07T02:00:00Z'); // 9pm CDT on the 6th
    const current = new Date('2026-08-07T09:00:00Z'); // 4am CDT on the 7th
    expect(digestDayFor(previous, current)).toBe('2026-08-06');
  });

  it('reports the day that was actually scraped after a gap', () => {
    const previous = new Date('2026-08-01T14:00:00Z');
    const current = new Date('2026-08-07T09:00:00Z');
    expect(digestDayFor(previous, current)).toBe('2026-08-01');
  });

  it('fires once across a sequence of runs', () => {
    const finishes = [
      new Date('2026-08-06T09:00:00Z'), // 4am CDT, 6th
      new Date('2026-08-06T15:00:00Z'), // 10am CDT, 6th
      new Date('2026-08-06T21:00:00Z'), // 4pm CDT, 6th
      new Date('2026-08-07T03:00:00Z'), // 10pm CDT, 6th
      new Date('2026-08-07T09:00:00Z'), // 4am CDT, 7th  <- boundary
      new Date('2026-08-07T15:00:00Z'), // 10am CDT, 7th
    ];

    const days = finishes.map((finishedAt, i) =>
      digestDayFor(i === 0 ? null : finishes[i - 1], finishedAt),
    );

    expect(days.filter(Boolean)).toEqual(['2026-08-06']);
  });
});

describe('formatDayKey', () => {
  it('reads as a US date without leading zeros', () => {
    expect(formatDayKey('2026-08-06')).toBe('8/6/2026');
    expect(formatDayKey('2026-12-25')).toBe('12/25/2026');
  });
});
