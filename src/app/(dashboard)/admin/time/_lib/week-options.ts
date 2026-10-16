// The pay-period picker for one employee: Friday weeks for remote, Monday
// weeks for In House (see src/lib/payroll/pay-schedule.ts).
import { periodOptions, type PaySchedule } from '@/lib/payroll/pay-schedule';

/** A pay-week change as the employee list API returns it. */
export interface PayScheduleChangeDto {
  schedule: PaySchedule;
  effectiveFrom: string;
}

/**
 * The employee's pay periods, newest first. `today` is read with local
 * getters on purpose: in the browser that is the viewer's own calendar date.
 */
export function employeeWeekOptions(
  changes: PayScheduleChangeDto[] | undefined,
  count: number,
  today: Date = new Date(),
): { value: string; label: string }[] {
  const history = (changes ?? []).map((c) => ({
    schedule: c.schedule,
    effectiveFrom: new Date(`${c.effectiveFrom}T00:00:00.000Z`),
  }));
  return periodOptions(history, count, new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
}

/**
 * The picker value to use for `selected`: itself when listed, else the
 * listed week containing it (e.g. a Friday picked for a remote employee,
 * then an In House one selected), else the newest week.
 */
export function weekForOptions(options: { value: string }[], selected: string): string {
  if (!selected) return options[0]?.value ?? '';
  if (options.some((o) => o.value === selected)) return selected;
  // Options are period starts, newest first: the first one on or before it.
  return options.find((o) => o.value <= selected)?.value ?? options[0]?.value ?? '';
}
