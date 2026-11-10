import { describe, it, expect } from 'vitest';
import {
  CLOCK_IN_START_OPTIONS,
  DEFAULT_CLOCK_IN_START,
  clockInStartFor,
  formatClockInStart,
  recordedClockIn,
  savedClockInStart,
} from './clock-in-start';

const ADMIN = 1;
const CLOSER = 2;
const REMOTE_AGENT = 3;

const t = (hhmmss: string) => {
  const [h, m, s = 0] = hhmmss.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, s));
};
const recorded = (punch: string, start: number, role: number | undefined) =>
  recordedClockIn(t(punch), start, role).toISOString().slice(11, 19);

describe('clockInStartFor', () => {
  it('is 6:00 AM when nothing is saved', () => {
    expect(DEFAULT_CLOCK_IN_START).toBe(360);
    expect(clockInStartFor(null)).toBe(360);
    expect(clockInStartFor(undefined)).toBe(360);
  });

  it.each(CLOCK_IN_START_OPTIONS.map((m) => [m]))('keeps the saved option %i', (minutes) => {
    expect(clockInStartFor(minutes)).toBe(minutes);
  });

  it.each([[0], [315], [600], [-60], [1440], [300.5]])(
    'falls back to 6:00 AM for %s, which the Users page cannot save',
    (minutes) => {
      expect(clockInStartFor(minutes)).toBe(360);
    },
  );
});

describe('savedClockInStart', () => {
  it.each([[240], [300], [420], [540]])('keeps %i, a start other than the default', (minutes) => {
    expect(savedClockInStart(minutes)).toBe(minutes);
  });

  it.each([[null], [undefined], [360], [315], [600]])('is null for %s: the account is on the default', (minutes) => {
    expect(savedClockInStart(minutes)).toBeNull();
  });
});

describe('recordedClockIn', () => {
  describe('roles without the early window', () => {
    it.each([
      // start, punch, recorded
      [300, '04:30:00', '05:00:00'],
      [300, '04:59:59', '05:00:00'],
      [300, '05:00:00', '05:00:00'],
      [300, '05:10:00', '05:10:00'],
      [360, '05:40:00', '06:00:00'],
      [360, '06:00:19', '06:00:19'],
      [420, '06:30:00', '07:00:00'],
      [420, '07:00:30', '07:00:30'],
      [240, '00:15:00', '04:00:00'],
      [540, '08:59:59', '09:00:00'],
    ])('start %i: a %s punch is recorded as %s', (start, punch, expected) => {
      expect(recorded(punch, start, REMOTE_AGENT)).toBe(expected);
    });

    it('treats a missing role like any other role', () => {
      expect(recorded('04:50:00', 300, undefined)).toBe('05:00:00');
    });
  });

  describe.each([
    ['Administrator', ADMIN],
    ['Closer', CLOSER],
  ])('%s: 15 minutes before the start count', (_name, role) => {
    it.each([
      [360, '05:44:59', '05:45:00'],
      [360, '05:45:00', '05:45:00'],
      [360, '05:50:00', '05:50:00'],
      [300, '04:30:00', '04:45:00'],
      [300, '04:44:59', '04:45:00'],
      [300, '04:50:00', '04:50:00'],
      [300, '05:10:00', '05:10:00'],
      [420, '06:30:00', '06:45:00'],
    ])('start %i: a %s punch is recorded as %s', (start, punch, expected) => {
      expect(recorded(punch, start, role)).toBe(expected);
    });
  });

  it('returns the punch itself, untouched, when it is not early', () => {
    const punch = t('06:00:19');
    expect(recordedClockIn(punch, 360, REMOTE_AGENT)).toBe(punch);
  });
});

describe('formatClockInStart', () => {
  it.each([
    [240, '4:00 AM'],
    [300, '5:00 AM'],
    [360, '6:00 AM'],
    [390, '6:30 AM'],
    [540, '9:00 AM'],
    [720, '12:00 PM'],
    [810, '1:30 PM'],
    [0, '12:00 AM'],
  ])('%i is %s', (minutes, label) => {
    expect(formatClockInStart(minutes)).toBe(label);
  });
});
