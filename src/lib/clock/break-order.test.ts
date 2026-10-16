import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BREAK_ORDER,
  PART_TIME_BREAK_ORDER,
  breakOrderFor,
  moveBreak,
  nextClockAction,
  punchOrder,
  punchOrderError,
  savedBreakOrder,
  serializeBreakOrder,
  toggleBreak,
} from './break-order';

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m));
};
const emptyLog = {
  clockIn: null, firstBreakOut: null, firstBreakIn: null, lunchOut: null,
  lunchIn: null, secondBreakOut: null, secondBreakIn: null, clockOut: null,
};

describe('breakOrderFor', () => {
  it('gives full-time employees Break, Lunch, Break by default', () => {
    expect(breakOrderFor(null, false)).toEqual(['firstBreak', 'lunch', 'secondBreak']);
  });

  it('gives part-time employees one break and no lunch by default', () => {
    expect(breakOrderFor(null, true)).toEqual(['firstBreak']);
  });

  it('uses the order saved on the user over either default', () => {
    expect(breakOrderFor('lunch,firstBreak,secondBreak', false)).toEqual(['lunch', 'firstBreak', 'secondBreak']);
    expect(breakOrderFor('firstBreak,lunch', true)).toEqual(['firstBreak', 'lunch']);
  });

  it('allows a saved order with no breaks at all', () => {
    expect(breakOrderFor('', false)).toEqual([]);
  });

  it('falls back to the default when the saved order is corrupt', () => {
    expect(breakOrderFor('lunch,coffee', false)).toEqual(DEFAULT_BREAK_ORDER);
    expect(breakOrderFor('lunch,lunch', true)).toEqual(PART_TIME_BREAK_ORDER);
  });

  it('round-trips through serializeBreakOrder', () => {
    expect(breakOrderFor(serializeBreakOrder(['lunch', 'secondBreak']), false)).toEqual(['lunch', 'secondBreak']);
  });
});

describe('punchOrder', () => {
  it('wraps the breaks between clock-in and clock-out', () => {
    expect(punchOrder(['lunch', 'firstBreak'])).toEqual([
      'clockIn', 'lunchOut', 'lunchIn', 'firstBreakOut', 'firstBreakIn', 'clockOut',
    ]);
  });
});

describe('nextClockAction', () => {
  it('starts with clock-in', () => {
    expect(nextClockAction(null, DEFAULT_BREAK_ORDER)).toBe('clockIn');
  });

  it('sends Janice to lunch first', () => {
    const order = breakOrderFor('lunch,firstBreak,secondBreak', false);
    expect(nextClockAction({ ...emptyLog, clockIn: t('06:00') }, order)).toBe('lunchOut');
    expect(nextClockAction({ ...emptyLog, clockIn: t('06:00'), lunchOut: t('09:00'), lunchIn: t('09:30') }, order)).toBe('firstBreakOut');
  });

  it('takes a part-timer straight from their break to clock-out', () => {
    const log = { ...emptyLog, clockIn: t('06:00'), firstBreakOut: t('08:00'), firstBreakIn: t('08:10') };
    expect(nextClockAction(log, PART_TIME_BREAK_ORDER)).toBe('clockOut');
  });

  it('is done once clocked out', () => {
    expect(nextClockAction({ ...emptyLog, clockIn: t('06:00'), clockOut: t('14:30') }, DEFAULT_BREAK_ORDER)).toBeNull();
  });
});

describe('punchOrderError', () => {
  it('accepts Janice\'s lunch before her first break', () => {
    const log = { ...emptyLog, clockIn: t('06:00'), lunchOut: t('09:00'), lunchIn: t('09:30'), firstBreakOut: t('11:00'), firstBreakIn: t('11:10') };
    expect(punchOrderError(log, ['lunch', 'firstBreak', 'secondBreak'])).toBeNull();
  });

  it('rejects the same day under the standard order', () => {
    const log = { ...emptyLog, clockIn: t('06:00'), lunchOut: t('09:00'), lunchIn: t('09:30'), firstBreakOut: t('11:00'), firstBreakIn: t('11:10') };
    expect(punchOrderError(log, DEFAULT_BREAK_ORDER)).toBe('firstBreakIn cannot be after lunchOut');
  });

  it('ignores blank punches', () => {
    expect(punchOrderError({ ...emptyLog, clockIn: t('06:00'), clockOut: t('14:30') }, DEFAULT_BREAK_ORDER)).toBeNull();
  });

  it('still keeps punches outside the order inside the shift', () => {
    const log = { ...emptyLog, clockIn: t('06:00'), lunchOut: t('05:00'), clockOut: t('14:30') };
    expect(punchOrderError(log, PART_TIME_BREAK_ORDER)).toBe('lunchOut must be between clockIn and clockOut');
  });
});

describe('savedBreakOrder', () => {
  it('is null while the user is on the default', () => {
    expect(savedBreakOrder(null)).toBeNull();
  });
  it('lists a custom order', () => {
    expect(savedBreakOrder('lunch,firstBreak')).toEqual(['lunch', 'firstBreak']);
    expect(savedBreakOrder('')).toEqual([]);
  });
});

describe('toggleBreak / moveBreak', () => {
  it('adds a break at the end and removes it again', () => {
    expect(toggleBreak(['firstBreak'], 'lunch')).toEqual(['firstBreak', 'lunch']);
    expect(toggleBreak(['firstBreak', 'lunch'], 'firstBreak')).toEqual(['lunch']);
  });

  it('moves lunch to the front for a lunch-first order', () => {
    expect(moveBreak(['firstBreak', 'lunch', 'secondBreak'], 'lunch', -1)).toEqual(['lunch', 'firstBreak', 'secondBreak']);
  });

  it('does nothing past either end', () => {
    expect(moveBreak(['lunch', 'firstBreak'], 'lunch', -1)).toEqual(['lunch', 'firstBreak']);
    expect(moveBreak(['lunch', 'firstBreak'], 'firstBreak', 1)).toEqual(['lunch', 'firstBreak']);
  });
});
