// What a pay-week change does to bonuses already recorded. Bonuses are filed
// under the start of the pay period they belong to, and a change moves period
// boundaries from a week before it on, so dated bonuses there are re-filed to
// their new period and per-period bonuses must still start a period.
import { addDaysUTC } from '@/lib/time';
import { BONUS_FIELD_LABELS, DATED_BONUS_RULES, isDatedBonus } from './constants';
import { periodContaining, type ScheduleChange } from './pay-schedule';

/** The first day a change on `effectiveFrom` can affect: the week it cuts short starts at most 6 days earlier. */
export const affectedFrom = (effectiveFrom: Date): Date => addDaysUTC(effectiveFrom, -7);

export interface DatedEntryRow {
  idEntry: number;
  category: string;
  entryDate: Date;
  periodStart: Date;
}

export interface PeriodBonusRow {
  periodStart: Date;
  /** Any amount typed (an all-blank row pays nothing and can stay). */
  hasAmounts: boolean;
}

export interface BonusRefilePlan {
  moves: { idEntry: number; periodStart: Date }[];
  /** Why the change can't be made without losing or double-paying a bonus. */
  error: string | null;
}

const dayLabel = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Where each affected bonus belongs under `history` (the history after the change). */
export function planBonusRefile(
  history: readonly ScheduleChange[],
  entries: readonly DatedEntryRow[],
  periodBonuses: readonly PeriodBonusRow[],
): BonusRefilePlan {
  const stranded = periodBonuses.find(
    (b) => b.hasAmounts && periodContaining(history, b.periodStart).start.getTime() !== b.periodStart.getTime(),
  );
  if (stranded) {
    return {
      moves: [],
      error: `Bonuses typed for the week of ${dayLabel(stranded.periodStart)} would no longer belong to a pay week. Clear them in the Payment Report, switch, then enter them again.`,
    };
  }

  const placed = entries.map((e) => ({ ...e, newStart: periodContaining(history, e.entryDate).start }));
  for (const [category, rule] of Object.entries(DATED_BONUS_RULES)) {
    const byPeriod = new Map<number, typeof placed>();
    for (const e of placed.filter((p) => p.category === category)) {
      byPeriod.set(e.newStart.getTime(), [...(byPeriod.get(e.newStart.getTime()) ?? []), e]);
    }
    for (const [start, inPeriod] of byPeriod) {
      const days = inPeriod.map((e) => e.entryDate.getTime());
      const label = isDatedBonus(category) ? BONUS_FIELD_LABELS[category] : category;
      const week = dayLabel(new Date(start));
      if (inPeriod.length > rule.maxPerPeriod) {
        return { moves: [], error: `${label}: at most ${rule.maxPerPeriod} per pay period, and the week of ${week} would have ${inPeriod.length}. Remove some first.` };
      }
      if (rule.onePerDay && new Set(days).size !== days.length) {
        return { moves: [], error: `${label}: only one per day, and the week of ${week} would have two on one day. Remove one first.` };
      }
    }
  }

  return {
    moves: placed
      .filter((e) => e.newStart.getTime() !== e.periodStart.getTime())
      .map((e) => ({ idEntry: e.idEntry, periodStart: e.newStart })),
    error: null,
  };
}
