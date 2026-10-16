// Client-safe: which pay week each employee is on, and what that week is.
// Remote employees are paid Friday–Thursday; In House employees Monday–Friday.
// A change takes effect on the first day of the new week type (a Monday for
// In House, a Friday for remote), and cuts the previous week short there, so
// no day ever belongs to two pay periods. With no history an employee is remote,
// which is exactly how every period worked before In House existed.
import { addDaysUTC } from '@/lib/time';

export const PAY_SCHEDULES = ['remote', 'inhouse'] as const;
export type PaySchedule = (typeof PAY_SCHEDULES)[number];

export const PAY_SCHEDULE_LABELS: Record<PaySchedule, string> = {
  remote: 'Remote (Fri–Thu)',
  inhouse: 'In House (Mon–Fri)',
};

/** UTC weekday each pay week starts on (0 = Sunday). */
export const PERIOD_START_DAY: Record<PaySchedule, number> = { remote: 5, inhouse: 1 };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** From `effectiveFrom` (UTC midnight) on, the employee is on `schedule`. */
export interface ScheduleChange {
  schedule: PaySchedule;
  effectiveFrom: Date;
}

/** One pay period: [start, end), both UTC midnight. */
export interface PayPeriod {
  start: Date;
  end: Date;
  schedule: PaySchedule;
}

const DAY_MS = 86_400_000;
const midnight = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const byDate = (history: readonly ScheduleChange[]) =>
  [...history].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());

/** The change in force on `day`, if any. */
function changeOn(history: readonly ScheduleChange[], day: Date): ScheduleChange | null {
  const inForce = byDate(history).filter((c) => c.effectiveFrom.getTime() <= day.getTime());
  return inForce.at(-1) ?? null;
}

export function scheduleOn(history: readonly ScheduleChange[], day: Date): PaySchedule {
  return changeOn(history, midnight(day))?.schedule ?? 'remote';
}

/** The first day of the `schedule` week containing `date` (Friday remote, Monday In House). */
export function weekStart(schedule: PaySchedule, date: Date): Date {
  const day = midnight(date);
  return addDaysUTC(day, -((day.getUTCDay() - PERIOD_START_DAY[schedule] + 7) % 7));
}

/** The pay period `day` falls in, for this employee. */
export function periodContaining(history: readonly ScheduleChange[], date: Date): PayPeriod {
  const day = midnight(date);
  const current = changeOn(history, day);
  const schedule = current?.schedule ?? 'remote';
  const first = weekStart(schedule, day);
  const next = byDate(history).find((c) => c.effectiveFrom.getTime() > day.getTime());
  const start = current && current.effectiveFrom.getTime() > first.getTime() ? current.effectiveFrom : first;
  const weekEnd = addDaysUTC(first, 7);
  const end = next && next.effectiveFrom.getTime() < weekEnd.getTime() ? next.effectiveFrom : weekEnd;
  return { start, end, schedule };
}

/** YYYY-MM-DD of each weekday (Mon–Fri) in the period. */
export function periodWorkDates(period: PayPeriod): string[] {
  const dates: string[] = [];
  for (let t = period.start.getTime(); t < period.end.getTime(); t += DAY_MS) {
    const day = new Date(t);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

const fmt = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Oct 16 - Oct 22, 2026": first to last workday; a one-day period as that day. */
export function periodLabel(period: PayPeriod): string {
  const workDates = periodWorkDates(period);
  const last = workDates.length > 0 ? new Date(`${workDates.at(-1)}T00:00:00.000Z`) : addDaysUTC(period.end, -1);
  const year = last.getUTCFullYear();
  return last.getTime() === period.start.getTime()
    ? `${fmt(period.start)}, ${year}`
    : `${fmt(period.start)} - ${fmt(last)}, ${year}`;
}

/** This employee's pay periods for a picker, newest first, ending at `today`'s. */
export function periodOptions(
  history: readonly ScheduleChange[],
  count: number,
  today: Date,
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  let period = periodContaining(history, today);
  for (let i = 0; i < count; i++) {
    options.push({ value: period.start.toISOString().slice(0, 10), label: periodLabel(period) });
    period = periodContaining(history, addDaysUTC(period.start, -1));
  }
  return options;
}

/** Every week of one payroll group, newest first: Fridays remote, Mondays In House. */
export function groupWeekOptions(group: PaySchedule, count: number, today: Date): { value: string; label: string }[] {
  const always: ScheduleChange[] = group === 'inhouse' ? [{ schedule: 'inhouse', effectiveFrom: new Date(0) }] : [];
  return periodOptions(always, count, today);
}

/** Which payroll a PayRun is, from its start: Monday = In House, otherwise remote. */
export const runGroup = (periodStart: Date): PaySchedule =>
  midnight(periodStart).getUTCDay() === PERIOD_START_DAY.inhouse ? 'inhouse' : 'remote';

/** A full week's last workday: Thursday for remote, Friday for In House. */
export const lastWorkDay = (group: PaySchedule, periodStart: Date): Date =>
  addDaysUTC(midnight(periodStart), group === 'inhouse' ? 4 : 6);

/** The first day a switch to `schedule` can start on, from `today` on (its Monday or Friday). */
export function nextStartDay(schedule: PaySchedule, today: Date): Date {
  const day = midnight(today);
  return addDaysUTC(day, (PERIOD_START_DAY[schedule] - day.getUTCDay() + 7) % 7);
}

/** Why a change can't take effect on `date`, or null. */
export function effectiveFromError(schedule: PaySchedule, date: Date): string | null {
  const startDay = PERIOD_START_DAY[schedule];
  return midnight(date).getUTCDay() === startDay
    ? null
    : `${PAY_SCHEDULE_LABELS[schedule]} must start on a ${DAY_NAMES[startDay]}.`;
}
