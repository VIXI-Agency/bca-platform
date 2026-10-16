import { describe, it, expect } from 'vitest';
import {
  effectiveFromError,
  groupWeekOptions,
  lastWorkDay,
  runGroup,
  nextStartDay,
  periodContaining,
  periodLabel,
  periodOptions,
  periodWorkDates,
  scheduleOn,
  type ScheduleChange,
} from './pay-schedule';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const span = (p: { start: Date; end: Date }) => `${iso(p.start)}..${iso(p.end)}`;

/** Trini: remote until In House starts Mon 10/19. */
const TRINI: ScheduleChange[] = [{ schedule: 'inhouse', effectiveFrom: d('2026-10-19') }];

describe('scheduleOn', () => {
  it('is remote with no history', () => {
    expect(scheduleOn([], d('2026-10-20'))).toBe('remote');
  });
  it('switches on the effective date', () => {
    expect(scheduleOn(TRINI, d('2026-10-18'))).toBe('remote');
    expect(scheduleOn(TRINI, d('2026-10-19'))).toBe('inhouse');
  });
});

describe('periodContaining', () => {
  it('keeps the Friday–Thursday week for remote employees', () => {
    expect(span(periodContaining([], d('2026-10-20')))).toBe('2026-10-16..2026-10-23');
    expect(span(periodContaining([], d('2026-10-16')))).toBe('2026-10-16..2026-10-23');
  });

  it('gives In House employees a Monday week', () => {
    const always: ScheduleChange[] = [{ schedule: 'inhouse', effectiveFrom: d('2026-01-05') }];
    expect(span(periodContaining(always, d('2026-10-23')))).toBe('2026-10-19..2026-10-26');
    expect(span(periodContaining(always, d('2026-10-19')))).toBe('2026-10-19..2026-10-26');
  });

  it('cuts the last remote week short at the switch: Fri 10/16 is paid on its own', () => {
    const before = periodContaining(TRINI, d('2026-10-16'));
    expect(span(before)).toBe('2026-10-16..2026-10-19');
    expect(before.schedule).toBe('remote');
    const after = periodContaining(TRINI, d('2026-10-19'));
    expect(span(after)).toBe('2026-10-19..2026-10-26');
    expect(after.schedule).toBe('inhouse');
  });

  it('cuts the last In House week short when going back to remote', () => {
    const back: ScheduleChange[] = [...TRINI, { schedule: 'remote', effectiveFrom: d('2026-10-30') }];
    expect(span(periodContaining(back, d('2026-10-27')))).toBe('2026-10-26..2026-10-30');
    expect(span(periodContaining(back, d('2026-10-30')))).toBe('2026-10-30..2026-11-06');
  });

  it('reads history in any order', () => {
    const back: ScheduleChange[] = [{ schedule: 'remote', effectiveFrom: d('2026-10-30') }, ...TRINI];
    expect(span(periodContaining(back, d('2026-10-21')))).toBe('2026-10-19..2026-10-26');
  });
});

describe('periodWorkDates', () => {
  it('lists Fri, Mon–Thu for remote', () => {
    expect(periodWorkDates(periodContaining([], d('2026-10-16')))).toEqual([
      '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22',
    ]);
  });
  it('lists Mon–Fri for In House', () => {
    expect(periodWorkDates(periodContaining(TRINI, d('2026-10-19')))).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
    ]);
  });
  it('lists only Friday for the cut-short week', () => {
    expect(periodWorkDates(periodContaining(TRINI, d('2026-10-16')))).toEqual(['2026-10-16']);
  });
});

describe('periodLabel', () => {
  it('matches the existing remote label', () => {
    expect(periodLabel(periodContaining([], d('2026-10-16')))).toBe('Oct 16 - Oct 22, 2026');
  });
  it('ends an In House week on Friday', () => {
    expect(periodLabel(periodContaining(TRINI, d('2026-10-19')))).toBe('Oct 19 - Oct 23, 2026');
  });
  it('shows a one-day week as that day', () => {
    expect(periodLabel(periodContaining(TRINI, d('2026-10-16')))).toBe('Oct 16, 2026');
  });
});

describe('periodOptions', () => {
  it('walks back through each week, newest first, across the switch', () => {
    const options = periodOptions(TRINI, 4, d('2026-10-21'));
    expect(options.map((o) => o.value)).toEqual(['2026-10-19', '2026-10-16', '2026-10-09', '2026-10-02']);
    expect(options[1].label).toBe('Oct 16, 2026');
  });
  it('is the plain Friday list for remote employees', () => {
    expect(periodOptions([], 2, d('2026-10-21')).map((o) => o.value)).toEqual(['2026-10-16', '2026-10-09']);
  });
});

describe('runGroup / lastWorkDay', () => {
  it('tells the payroll from the run start and ends it on its last workday', () => {
    expect(runGroup(d('2026-10-19'))).toBe('inhouse');
    expect(runGroup(d('2026-10-16'))).toBe('remote');
    expect(iso(lastWorkDay('inhouse', d('2026-10-19')))).toBe('2026-10-23');
    expect(iso(lastWorkDay('remote', d('2026-10-16')))).toBe('2026-10-22');
  });
});

describe('groupWeekOptions', () => {
  it('lists Monday weeks for the In House payroll and Friday weeks for remote', () => {
    expect(groupWeekOptions('inhouse', 2, d('2026-10-21'))).toEqual([
      { value: '2026-10-19', label: 'Oct 19 - Oct 23, 2026' },
      { value: '2026-10-12', label: 'Oct 12 - Oct 16, 2026' },
    ]);
    expect(groupWeekOptions('remote', 1, d('2026-10-21'))[0].value).toBe('2026-10-16');
  });
});

describe('effectiveFromError', () => {
  it('requires In House to start on a Monday and remote on a Friday', () => {
    expect(effectiveFromError('inhouse', d('2026-10-19'))).toBeNull();
    expect(effectiveFromError('inhouse', d('2026-10-20'))).toMatch(/Monday/);
    expect(effectiveFromError('remote', d('2026-10-23'))).toBeNull();
    expect(effectiveFromError('remote', d('2026-10-19'))).toMatch(/Friday/);
  });
});

describe('nextStartDay', () => {
  it('is the next Monday for In House, or today when today is Monday', () => {
    expect(iso(nextStartDay('inhouse', d('2026-10-16')))).toBe('2026-10-19');
    expect(iso(nextStartDay('inhouse', d('2026-10-19')))).toBe('2026-10-19');
  });
  it('is the next Friday for remote', () => {
    expect(iso(nextStartDay('remote', d('2026-10-19')))).toBe('2026-10-23');
  });
});
