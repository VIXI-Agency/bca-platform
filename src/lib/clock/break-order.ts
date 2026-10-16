// Client-safe: which breaks an employee takes, and in what order. Shared by
// the clock, the skip button and Edit Time, so they never disagree about
// which punch comes next (a lunch-first day used to fail Edit Time's check).
import type { ClockAction } from '@/types';

export const BREAK_KINDS = ['firstBreak', 'lunch', 'secondBreak'] as const;
export type BreakKind = (typeof BREAK_KINDS)[number];

/** The EmployeeTimeLog columns each break fills. */
export const BREAK_PUNCHES = {
  firstBreak: { out: 'firstBreakOut', in: 'firstBreakIn' },
  lunch: { out: 'lunchOut', in: 'lunchIn' },
  secondBreak: { out: 'secondBreakOut', in: 'secondBreakIn' },
} as const satisfies Record<BreakKind, { out: ClockAction; in: ClockAction }>;

export const BREAK_LABELS: Record<BreakKind, string> = {
  firstBreak: '1st Break',
  lunch: 'Lunch',
  secondBreak: '2nd Break',
};

export const DEFAULT_BREAK_ORDER: readonly BreakKind[] = ['firstBreak', 'lunch', 'secondBreak'];
/** Part-time employees take one break and no lunch. */
export const PART_TIME_BREAK_ORDER: readonly BreakKind[] = ['firstBreak'];

const isBreakKind = (value: string): value is BreakKind => (BREAK_KINDS as readonly string[]).includes(value);

/**
 * The breaks this employee takes, in order. `saved` is Users.BreakOrder:
 * null means "the default for full/part time", '' means no breaks at all.
 */
export function breakOrderFor(saved: string | null | undefined, isPartTime: boolean): BreakKind[] {
  const fallback = [...(isPartTime ? PART_TIME_BREAK_ORDER : DEFAULT_BREAK_ORDER)];
  if (saved == null) return fallback;
  if (saved.trim() === '') return [];
  const kinds = saved.split(',').map((k) => k.trim());
  const valid = kinds.every(isBreakKind) && new Set(kinds).size === kinds.length;
  return valid ? (kinds as BreakKind[]) : fallback;
}

export const serializeBreakOrder = (order: readonly BreakKind[]): string => order.join(',');

/** A saved Users.BreakOrder for the Users page: null while on the default. */
export const savedBreakOrder = (saved: string | null | undefined): BreakKind[] | null =>
  saved == null ? null : breakOrderFor(saved, false);

/** The order with `kind` turned off, or added at the end when it was off. */
export const toggleBreak = (order: readonly BreakKind[], kind: BreakKind): BreakKind[] =>
  order.includes(kind) ? order.filter((k) => k !== kind) : [...order, kind];

/** The order with `kind` moved one place earlier (-1) or later (1). */
export function moveBreak(order: readonly BreakKind[], kind: BreakKind, direction: -1 | 1): BreakKind[] {
  const from = order.indexOf(kind);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Every punch of the day, in order: clock-in, each break out/in, clock-out. */
export function punchOrder(order: readonly BreakKind[]): ClockAction[] {
  return [
    'clockIn',
    ...order.flatMap((kind) => [BREAK_PUNCHES[kind].out, BREAK_PUNCHES[kind].in]),
    'clockOut',
  ];
}

type PunchLog = Record<ClockAction, Date | null>;

/** The next punch to record today, or null once clocked out. */
export function nextClockAction(log: PunchLog | null, order: readonly BreakKind[]): ClockAction | null {
  if (!log?.clockIn) return 'clockIn';
  if (log.clockOut) return null;
  return punchOrder(order).find((punch) => !log[punch]) ?? 'clockOut';
}

/**
 * Why a day's punches are out of order for this employee, or null. Blank
 * punches are skipped (clearing one never breaks the order). Punches outside
 * the employee's order, such as a lunch left on a part-timer's old day, only
 * have to fall inside the shift.
 */
export function punchOrderError(log: PunchLog, order: readonly BreakKind[]): string | null {
  const sequence = punchOrder(order);
  for (let i = 0; i < sequence.length - 1; i++) {
    const a = log[sequence[i]];
    const b = log[sequence[i + 1]];
    if (a && b && a.getTime() > b.getTime()) {
      return `${sequence[i]} cannot be after ${sequence[i + 1]}`;
    }
  }
  const { clockIn, clockOut } = log;
  for (const kind of BREAK_KINDS.filter((k) => !order.includes(k))) {
    for (const punch of [BREAK_PUNCHES[kind].out, BREAK_PUNCHES[kind].in]) {
      const value = log[punch];
      if (!value) continue;
      if ((clockIn && value.getTime() < clockIn.getTime()) || (clockOut && value.getTime() > clockOut.getTime())) {
        return `${punch} must be between clockIn and clockOut`;
      }
    }
  }
  return null;
}
