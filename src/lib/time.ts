/**
 * PST time utilities for SQL Server TIME column storage.
 *
 * SQL Server TIME columns store time-of-day only (no date, no timezone).
 * Prisma maps them to JavaScript Date objects with epoch date (1970-01-01).
 * The tedious driver reads/writes UTC components to TIME columns.
 *
 * Convention: all times are stored as PST (America/Los_Angeles) wall-clock values.
 * We create Date objects where UTC components equal PST hours/minutes/seconds,
 * so tedious writes the PST time into the TIME column.
 */

const TZ = 'America/Los_Angeles';

/**
 * Get current PST wall-clock time as a UTC-epoch Date.
 * Example: 6:15 AM PST → Date(1970-01-01T06:15:00Z)
 */
export function nowPstAsUtc(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);

  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
  const s = parseInt(parts.find(p => p.type === 'second')?.value ?? '0');

  return new Date(Date.UTC(1970, 0, 1, h, m, s));
}

/**
 * Get the current PST hour (0-23).
 */
export function getPstHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      hour: 'numeric',
    }).format(new Date())
  );
}

/**
 * Get today's PST date boundaries as UTC midnight dates.
 * logDate in the database is stored as midnight UTC representing the PST calendar date.
 */
export function getTodayRangePST(): { todayStart: Date; todayEnd: Date } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);

  const y = parseInt(parts.find(p => p.type === 'year')?.value ?? '2026');
  const mo = parseInt(parts.find(p => p.type === 'month')?.value ?? '1') - 1;
  const d = parseInt(parts.find(p => p.type === 'day')?.value ?? '1');

  const todayStart = new Date(Date.UTC(y, mo, d));
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  return { todayStart, todayEnd };
}

/**
 * Convert an HH:mm string (PST) to a UTC-epoch Date for TIME column storage.
 * Example: "06:15" → Date(1970-01-01T06:15:00Z)
 */
export function timeStringToUtcDate(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

/**
 * Extract seconds-of-day from a stored time (Date from Prisma TIME column).
 * Since we store PST as UTC, getUTCHours() gives the PST hour.
 */
export function storedTimeToSeconds(d: Date): number {
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/**
 * Get current PST seconds-of-day.
 */
export function nowPstSeconds(): number {
  const pst = nowPstAsUtc();
  return pst.getUTCHours() * 3600 + pst.getUTCMinutes() * 60 + pst.getUTCSeconds();
}

/**
 * Compute elapsed minutes between a stored time (Prisma Date from TIME column)
 * and the current PST time. Both are in PST convention.
 * Handles midnight wraparound (e.g., stored 23:50, now 00:10 → 20 minutes).
 */
export function minutesSinceStored(stored: Date): number {
  const storedSec = storedTimeToSeconds(stored);
  const currentSec = nowPstSeconds();
  let diff = currentSec - storedSec;
  if (diff < 0) {
    diff += 24 * 3600; // wraparound past midnight
  }
  return diff / 60;
}

/**
 * Pay period boundary: Friday through Thursday (a 7-day calendar span), not
 * Monday–Sunday. Employees are still scheduled Monday–Friday, but the pay
 * period used for timesheets/payroll is anchored on Friday — confirmed
 * against the company's existing manual timesheets (e.g. "Week Starts:
 * 6/26/2026 [Fri] — Week Ends: 7/2/2026 [Thu]"). A Monday–Thursday block
 * belongs to the pay period that started on the *preceding* Friday, not the
 * Friday that falls later in the same calendar week.
 */

/** Day offsets (from the Friday start) of the actual working days in one pay period: Fri, Mon, Tue, Wed, Thu. */
export const PAY_PERIOD_DAY_OFFSETS = [0, 3, 4, 5, 6] as const;

/** Get the Friday (UTC midnight) that starts the pay period containing `date`. */
export function getPayPeriodStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  // Days since last Friday: Fri(5)->0, Sat(6)->1, Sun(0)->2, Mon(1)->3, Tue(2)->4, Wed(3)->5, Thu(4)->6
  const daysSinceFriday = (dayOfWeek + 2) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceFriday);
  return d;
}

/** ISO date strings (YYYY-MM-DD) for the working days of a pay period, given its Friday start. */
export function getPayPeriodWorkDates(periodStart: Date): string[] {
  return PAY_PERIOD_DAY_OFFSETS.map((offset) => {
    const d = new Date(periodStart);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().split('T')[0];
  });
}
