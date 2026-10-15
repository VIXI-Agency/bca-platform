import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTime, breakMinutes, elapsedMinutes, formatDuration, formatMinutes } from './format';

describe('formatTime', () => {
  it('reads a TIME column (1970-01-01, Pacific wall clock in UTC fields)', () => {
    expect(formatTime('1970-01-01T13:05:00.000Z')).toBe('1:05pm');
  });

  it('reads an HH:mm string', () => {
    expect(formatTime('06:00')).toBe('6:00am');
  });

  it('shows midnight and noon as 12', () => {
    expect(formatTime('00:30')).toBe('12:30am');
    expect(formatTime('1970-01-01T12:00:00.000Z')).toBe('12:00pm');
  });

  it('shows a placeholder for a missing time', () => {
    expect(formatTime(null)).toBe('--:--');
    expect(formatTime(undefined)).toBe('--:--');
    expect(formatTime('')).toBe('--:--');
  });
});

describe('breakMinutes', () => {
  it('counts minutes between two ISO times', () => {
    expect(breakMinutes('1970-01-01T09:15:00.000Z', '1970-01-01T09:25:00.000Z')).toBe(10);
  });

  it('counts minutes between two HH:mm times', () => {
    expect(breakMinutes('10:00', '10:30')).toBe(30);
  });

  it('counts a break that starts at midnight', () => {
    expect(breakMinutes('1970-01-01T00:00:00.000Z', '1970-01-01T00:10:00.000Z')).toBe(10);
    expect(breakMinutes('00:00', '00:10')).toBe(10);
  });

  it('goes negative across midnight (there are no overnight shifts)', () => {
    expect(breakMinutes('23:50', '00:05')).toBe(-1425);
  });

  it('returns null while the break is still open', () => {
    expect(breakMinutes('1970-01-01T09:15:00.000Z', null)).toBeNull();
    expect(breakMinutes(null, '10:00')).toBeNull();
  });
});

describe('elapsedMinutes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts from a Pacific start time to the current Pacific time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T16:30:00.000Z')); // 9:30 AM PDT
    expect(elapsedMinutes('1970-01-01T09:00:00.000Z')).toBe(30);
  });

  it('never goes negative for a start later than now', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T16:30:00.000Z'));
    expect(elapsedMinutes('1970-01-01T10:00:00.000Z')).toBe(0);
  });

  it('is 0 without a start time', () => {
    expect(elapsedMinutes(null)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats hours and zero-padded minutes', () => {
    expect(formatDuration(75)).toBe('1h 15m');
    expect(formatDuration(0)).toBe('0h 00m');
  });

  it('drops the sign of a negative duration', () => {
    expect(formatDuration(-75)).toBe('1h 15m');
  });

  it('shows a placeholder for null', () => {
    expect(formatDuration(null)).toBe('--:--');
  });
});

describe('formatMinutes', () => {
  it('appends the unit', () => {
    expect(formatMinutes(5)).toBe('5 min');
  });
});
