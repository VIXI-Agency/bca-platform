import { describe, it, expect } from 'vitest';
import { affectedFrom, planBonusRefile } from './pay-schedule-change';
import type { ScheduleChange } from './pay-schedule';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const INHOUSE_FROM_1019: ScheduleChange[] = [{ schedule: 'inhouse', effectiveFrom: d('2026-10-19') }];
const entry = (id: number, category: string, date: string, periodStart: string) => ({
  idEntry: id, category, entryDate: d(date), periodStart: d(periodStart),
});

describe('affectedFrom', () => {
  it('starts a week before the change: the week it cuts short begins at most 6 days earlier', () => {
    expect(affectedFrom(d('2026-10-19')).toISOString().slice(0, 10)).toBe('2026-10-12');
  });
});

describe('planBonusRefile', () => {
  it('moves nothing when the switch is scheduled ahead (the usual case)', () => {
    const plan = planBonusRefile(INHOUSE_FROM_1019, [entry(1, 'ccfSpiffs', '2026-10-16', '2026-10-16')], []);
    expect(plan).toEqual({ moves: [], error: null });
  });

  it('re-files bonuses earned after a backdated switch into the new Monday week', () => {
    const plan = planBonusRefile(
      INHOUSE_FROM_1019,
      [entry(1, 'ccfSpiffs', '2026-10-16', '2026-10-16'), entry(2, 'ccfSpiffs', '2026-10-19', '2026-10-16'), entry(3, 'wheelSpins', '2026-10-20', '2026-10-16')],
      [],
    );
    expect(plan.error).toBeNull();
    expect(plan.moves).toEqual([
      { idEntry: 2, periodStart: d('2026-10-19') },
      { idEntry: 3, periodStart: d('2026-10-19') },
    ]);
  });

  it('refuses when re-filing would break a cap in the new week', () => {
    // In House backdated to Mon 10/12: two spins from the remote week of 10/9
    // and one from the week of 10/16 all land in the In House week of 10/12.
    const history: ScheduleChange[] = [{ schedule: 'inhouse', effectiveFrom: d('2026-10-12') }];
    const plan = planBonusRefile(
      history,
      [
        entry(1, 'wheelSpins', '2026-10-12', '2026-10-09'),
        entry(2, 'wheelSpins', '2026-10-13', '2026-10-09'),
        entry(3, 'wheelSpins', '2026-10-16', '2026-10-16'),
      ],
      [],
    );
    expect(plan.error).toMatch(/Wheel Spins: at most 2/);
  });

  it('refuses when a typed weekly bonus would no longer start a pay week', () => {
    const plan = planBonusRefile(INHOUSE_FROM_1019, [], [{ periodStart: d('2026-10-23'), hasAmounts: true }]);
    expect(plan.error).toMatch(/Oct 23/);
  });

  it('ignores an empty weekly bonus row', () => {
    const plan = planBonusRefile(INHOUSE_FROM_1019, [], [{ periodStart: d('2026-10-23'), hasAmounts: false }]);
    expect(plan.error).toBeNull();
  });
});
