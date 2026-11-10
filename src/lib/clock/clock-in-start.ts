// Client-safe: when an employee's shift starts, and what a clock-in before
// that is recorded as. Shared by the clock route and the Users page so the
// times an admin can pick are the times the clock understands.
//
// All values are minutes after midnight, Pacific time, like every stored
// clock time (see src/lib/time.ts).

/** 6:00 AM: the shift start of everyone without a saved one. */
export const DEFAULT_CLOCK_IN_START = 360;

/** The starts the Users page offers: 4:00 to 9:00 AM, on the hour. */
export const CLOCK_IN_START_OPTIONS = [240, 300, 360, 420, 480, 540] as const;
export type ClockInStart = (typeof CLOCK_IN_START_OPTIONS)[number];

/** Administrator (1) and Closer (2) may clock in this long before their start. */
export const EARLY_GRACE_MINUTES = 15;
export const EARLY_GRACE_ROLES: readonly number[] = [1, 2];

export const isClockInStart = (minutes: number): minutes is ClockInStart =>
  (CLOCK_IN_START_OPTIONS as readonly number[]).includes(minutes);

/**
 * This employee's shift start. `saved` is Users.ClockInStartMinutes: null
 * means the default, and so does a value the Users page could not have
 * saved, so a stray row can never move someone's paid time.
 */
export function clockInStartFor(saved: number | null | undefined): number {
  return saved != null && isClockInStart(saved) ? saved : DEFAULT_CLOCK_IN_START;
}

/**
 * The time to record for a clock-in punched at `time`. A punch before the
 * shift start is recorded as the start, however early it was; Administrators
 * and Closers get their real time from 15 minutes before it. From then on a
 * punch is recorded as it happened.
 *
 * Compared in whole minutes, so 05:44:59 is still before a 05:45 window.
 */
export function recordedClockIn(time: Date, startMinutes: number, role: number | undefined): Date {
  const grace = role != null && EARLY_GRACE_ROLES.includes(role) ? EARLY_GRACE_MINUTES : 0;
  const earliest = startMinutes - grace;
  const punched = time.getUTCHours() * 60 + time.getUTCMinutes();
  if (punched >= earliest) return time;
  return new Date(Date.UTC(1970, 0, 1, Math.floor(earliest / 60), earliest % 60, 0));
}

/** 300 -> "5:00 AM". */
export function formatClockInStart(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

/**
 * A Users.ClockInStartMinutes as the Users page shows and saves it: null
 * while the account is on the default, so 6:00 AM is never stored as a
 * choice and stays the default if the default ever moves.
 */
export function savedClockInStart(saved: number | null | undefined): ClockInStart | null {
  return saved != null && isClockInStart(saved) && saved !== DEFAULT_CLOCK_IN_START ? saved : null;
}
