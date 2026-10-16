import { describe, it, expect } from 'vitest';
import { employeeWeekOptions, weekForOptions } from './week-options';

const today = new Date(2026, 9, 21); // Wed Oct 21, viewer's local date
const TRINI = [{ schedule: 'inhouse' as const, effectiveFrom: '2026-10-19' }];

describe('employeeWeekOptions', () => {
  it('lists Friday weeks for a remote employee (or none selected)', () => {
    expect(employeeWeekOptions(undefined, 2, today).map((o) => o.value)).toEqual(['2026-10-16', '2026-10-09']);
  });

  it('lists an In House employee’s Monday weeks, with the cut-short Friday before the switch', () => {
    const options = employeeWeekOptions(TRINI, 3, today);
    expect(options).toEqual([
      { value: '2026-10-19', label: 'Oct 19 - Oct 23, 2026' },
      { value: '2026-10-16', label: 'Oct 16, 2026' },
      { value: '2026-10-09', label: 'Oct 9 - Oct 15, 2026' },
    ]);
  });
});

describe('weekForOptions', () => {
  const options = employeeWeekOptions(TRINI, 3, today);

  it('keeps a week that is in the list', () => {
    expect(weekForOptions(options, '2026-10-16')).toBe('2026-10-16');
  });

  it('moves a week picked for someone else to this employee’s week containing it', () => {
    expect(weekForOptions(options, '2026-10-22')).toBe('2026-10-19');
    expect(weekForOptions(options, '2026-10-12')).toBe('2026-10-09');
  });

  it('falls back to the newest week when nothing is picked yet', () => {
    expect(weekForOptions(options, '')).toBe('2026-10-19');
  });
});
