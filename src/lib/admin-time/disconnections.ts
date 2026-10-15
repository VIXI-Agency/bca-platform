import { z } from 'zod';

export const DISCONNECTION_TYPES = [
  'absence',
  'early_leave',
  'power_outage',
  'internet_outage',
  'other',
] as const;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return !isNaN(date.getTime()) && date.toISOString().startsWith(s);
  }, 'Invalid date');
/** Same bar as time edits: the reason ends up on the Payment Report. */
const changeReason = z.string().trim().min(8, 'Give a real reason (at least 8 characters)').max(500);

/** A disconnection recorded after the fact (e.g. one nobody clicked yesterday). */
export const addDisconnectionSchema = z.object({
  userId: z.number().int().positive(),
  date: calendarDay,
  start: hhmm,
  /** null = never reconnected that day: it runs until clock-out. */
  end: hhmm.nullable(),
  type: z.enum(DISCONNECTION_TYPES),
  reason: changeReason,
});

export const editDisconnectionSchema = z.object({
  start: hhmm,
  end: hhmm.nullable(),
  type: z.enum(DISCONNECTION_TYPES),
  reason: changeReason,
});

export const removeDisconnectionSchema = z.object({
  reason: changeReason,
});

/** "HH:mm" → minutes since midnight. */
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A reconnection has to come after the disconnection (there are no overnight shifts). */
export function windowError(start: string, end: string | null): string | null {
  if (end !== null && minutesOf(end) <= minutesOf(start)) {
    return 'The reconnection time must be after the disconnection time.';
  }
  return null;
}

/** A disconnection can't be recorded for a day that hasn't happened yet. */
export function isFutureDay(date: Date, todayStart: Date): boolean {
  return date.getTime() > todayStart.getTime();
}

/** UTC midnight for a YYYY-MM-DD string (the DATE column convention). */
export function dayFromString(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Where clause for disconnections that still count (not removed). */
export const notRemoved = { removedAt: null } as const;
