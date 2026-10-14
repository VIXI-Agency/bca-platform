import { prisma } from '@/lib/prisma';
import { BONUS_FIELDS, type BonusFieldKey } from './constants';

export interface TimeLogRow {
  clockIn: Date | null;
  firstBreakOut: Date | null;
  firstBreakIn: Date | null;
  lunchOut: Date | null;
  lunchIn: Date | null;
  secondBreakOut: Date | null;
  secondBreakIn: Date | null;
  clockOut: Date | null;
}

export interface DayMetrics {
  totalHours: number;
  overtime: number;
  firstBreakExcess: number;
  secondBreakExcess: number;
  lunchDurationMinutes: number;
  disconnectedMinutes: number;
}

/** One admin "Disconnect"→"Reconnect" span, as PST-as-UTC TIME values.
 *  `end` is null when the employee was never reconnected that day. */
export interface DisconnectionWindow {
  start: Date;
  end: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Milliseconds of a shift lost to disconnections. Every disconnection type is
 * unpaid. Each window is clipped to clock-in..clock-out, overlapping windows
 * are merged so no minute is counted twice, and any part that falls inside
 * lunch is left out because lunch is already deducted. A window with no
 * reconnection runs until clock-out.
 */
function disconnectedMs(
  windows: DisconnectionWindow[],
  clockInMs: number,
  clockOutMs: number,
  overnight: boolean,
  lunch: [number, number] | null,
): number {
  // TIME values carry no date. On an overnight shift anything earlier than
  // clock-in belongs to the following day, same as clockOut.
  const norm = (d: Date) => {
    const t = new Date(d).getTime();
    return overnight && t < clockInMs ? t + DAY_MS : t;
  };

  const clipped = windows
    .map((w): [number, number] => {
      const start = norm(w.start);
      let end = w.end ? norm(w.end) : clockOutMs;
      if (end < start) end += DAY_MS;
      return [Math.max(start, clockInMs), Math.min(end, clockOutMs)];
    })
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [s, e] of clipped) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  return merged.reduce((sum, [s, e]) => {
    const lunchOverlap = lunch ? Math.min(e, lunch[1]) - Math.max(s, lunch[0]) : 0;
    return sum + (e - s) - Math.max(0, lunchOverlap);
  }, 0);
}

/** Key used to match disconnections to the time log of the same employee/day. */
export function disconnectionKey(userId: number, date: Date): string {
  return `${userId}|${date.toISOString().split('T')[0]}`;
}

/** Disconnection windows whose date falls in [from, to), keyed by disconnectionKey(). */
export async function fetchDisconnectionWindows(
  from: Date,
  to: Date,
  userId?: number,
): Promise<Map<string, DisconnectionWindow[]>> {
  const rows = await prisma.employeeDisconnection.findMany({
    where: {
      disconnectionDate: { gte: from, lt: to },
      ...(userId ? { idUser: userId } : {}),
    },
    select: { idUser: true, disconnectionDate: true, disconnectionTime: true, reconnectionTime: true },
  });

  const byKey = new Map<string, DisconnectionWindow[]>();
  for (const r of rows) {
    const key = disconnectionKey(r.idUser, r.disconnectionDate);
    const list = byKey.get(key) ?? [];
    list.push({ start: r.disconnectionTime, end: r.reconnectionTime });
    byKey.set(key, list);
  }
  return byKey;
}

/**
 * Computes one day's paid hours from raw punch times. This is the single
 * source of truth for the math — it used to be copied verbatim in two API
 * routes (admin time + employee clock), which could silently drift apart.
 *
 * Overtime here is daily-only (anything past 8h/day, capped at 8h regular) —
 * there is no weekly 40h rule. Weekend logs are filtered out upstream by the
 * caller, not here.
 *
 * Unpaid time: lunch, plus any time the employee was disconnected by an admin
 * (see disconnectedMs). Breaks are paid regardless of length.
 */
export function computeDayMetrics(
  log: TimeLogRow,
  disconnections: DisconnectionWindow[] = [],
): DayMetrics {
  let totalHours = 0;
  let overtime = 0;
  let firstBreakExcess = 0;
  let secondBreakExcess = 0;
  let lunchDurationMinutes = 0;
  let disconnectedMinutes = 0;

  if (log.clockIn && log.clockOut) {
    const clockInMs = new Date(log.clockIn).getTime();
    let clockOutMs = new Date(log.clockOut).getTime();
    // Handle overnight shifts: if clockOut is before clockIn, add 24 hours
    const overnight = clockOutMs <= clockInMs;
    if (overnight) {
      clockOutMs += DAY_MS;
    }

    let lunchMs = 0;
    let lunchSpan: [number, number] | null = null;
    if (log.lunchOut && log.lunchIn) {
      let lunchOutMs = new Date(log.lunchOut).getTime();
      let lunchInMs = new Date(log.lunchIn).getTime();
      if (lunchInMs < lunchOutMs) lunchInMs += DAY_MS;
      lunchMs = lunchInMs - lunchOutMs;
      lunchDurationMinutes = lunchMs / (1000 * 60);
      if (overnight && lunchOutMs < clockInMs) {
        lunchOutMs += DAY_MS;
        lunchInMs += DAY_MS;
      }
      lunchSpan = [lunchOutMs, lunchInMs];
    }

    const discMs = disconnectedMs(disconnections, clockInMs, clockOutMs, overnight, lunchSpan);
    disconnectedMinutes = discMs / (1000 * 60);

    // firstBreakExcess/secondBreakExcess are still tracked (e.g. for a future
    // "who's taking long breaks" report) but are no longer subtracted from
    // paid hours below — breaks are paid time regardless of length. Only
    // lunch (lunchMs) is unpaid and comes out of the total.
    if (log.firstBreakOut && log.firstBreakIn) {
      const bOutMs = new Date(log.firstBreakOut).getTime();
      let bInMs = new Date(log.firstBreakIn).getTime();
      if (bInMs < bOutMs) bInMs += 24 * 60 * 60 * 1000;
      const breakMinutes = (bInMs - bOutMs) / (1000 * 60);
      if (breakMinutes > 10) {
        firstBreakExcess = round2(breakMinutes - 10);
      }
    }

    if (log.secondBreakOut && log.secondBreakIn) {
      const bOutMs = new Date(log.secondBreakOut).getTime();
      let bInMs = new Date(log.secondBreakIn).getTime();
      if (bInMs < bOutMs) bInMs += 24 * 60 * 60 * 1000;
      const breakMinutes = (bInMs - bOutMs) / (1000 * 60);
      if (breakMinutes > 10) {
        secondBreakExcess = round2(breakMinutes - 10);
      }
    }

    const rawMs = clockOutMs - clockInMs - lunchMs - discMs;
    totalHours = Math.max(0, round2(rawMs / (1000 * 3600)));

    if (totalHours > 8) {
      overtime = round2(totalHours - 8);
      totalHours = 8;
    }
  }

  return {
    totalHours,
    overtime,
    firstBreakExcess,
    secondBreakExcess,
    lunchDurationMinutes: round2(lunchDurationMinutes),
    disconnectedMinutes: round2(disconnectedMinutes),
  };
}

export interface PeriodHours {
  totalHours: number;
  overtime: number;
  firstBreakExcess: number;
  secondBreakExcess: number;
  disconnectedMinutes: number;
}

/** Sums computeDayMetrics across every weekday log in [periodStart, periodStart+7). */
export async function computePeriodHours(userId: number, periodStart: Date): Promise<PeriodHours> {
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 7);

  const [logs, disconnections] = await Promise.all([
    prisma.employeeTimeLog.findMany({
      where: { idUser: userId, logDate: { gte: periodStart, lt: periodEnd } },
    }),
    fetchDisconnectionWindows(periodStart, periodEnd, userId),
  ]);

  const weekdayLogs = logs.filter((log) => {
    const day = new Date(log.logDate).getUTCDay();
    return day !== 0 && day !== 6;
  });

  const days = weekdayLogs.map((log) =>
    computeDayMetrics(log, disconnections.get(disconnectionKey(userId, log.logDate))),
  );

  return {
    totalHours: round2(days.reduce((sum, d) => sum + d.totalHours, 0)),
    overtime: round2(days.reduce((sum, d) => sum + d.overtime, 0)),
    firstBreakExcess: round2(days.reduce((sum, d) => sum + d.firstBreakExcess, 0)),
    secondBreakExcess: round2(days.reduce((sum, d) => sum + d.secondBreakExcess, 0)),
    disconnectedMinutes: round2(days.reduce((sum, d) => sum + d.disconnectedMinutes, 0)),
  };
}

export interface PayStatementAmounts {
  regularHours: number;
  overtimeHours: number;
  payRate: number | null;
  otPayRate: number | null;
  regularPay: number;
  overtimePay: number;
  bonusAmounts: Record<BonusFieldKey, number>;
  bonusTotal: number;
  grossPay: number;
}

/**
 * The full dollar breakdown for one employee's pay period — hours × rate,
 * OT, and each bonus category. This is what the live Payment Report preview
 * shows, and what gets snapshotted into a PayStatement on approval.
 */
export async function computePayStatement(userId: number, periodStart: Date): Promise<PayStatementAmounts> {
  const [hours, user, bonus] = await Promise.all([
    computePeriodHours(userId, periodStart),
    prisma.user.findUnique({
      where: { idUser: userId },
      select: { payRate: true, otPayRate: true },
    }),
    prisma.payrollBonus.findUnique({
      where: { idUser_periodStart: { idUser: userId, periodStart } },
    }),
  ]);

  const payRate = user?.payRate != null ? Number(user.payRate) : null;
  const otPayRate = user?.otPayRate != null ? Number(user.otPayRate) : null;

  const regularPay = payRate != null ? round2(hours.totalHours * payRate) : 0;
  const overtimePay = hours.overtime > 0 && otPayRate != null ? round2(hours.overtime * otPayRate) : 0;

  const bonusAmounts = Object.fromEntries(
    BONUS_FIELDS.map((key) => [key, bonus?.[key] != null ? Number(bonus[key]) : 0]),
  ) as Record<BonusFieldKey, number>;
  const bonusTotal = round2(BONUS_FIELDS.reduce((sum, key) => sum + bonusAmounts[key], 0));

  return {
    regularHours: hours.totalHours,
    overtimeHours: hours.overtime,
    payRate,
    otPayRate,
    regularPay,
    overtimePay,
    bonusAmounts,
    bonusTotal,
    grossPay: round2(regularPay + overtimePay + bonusTotal),
  };
}

/** True once a PayRun for this period exists with status 'approved' or 'paid'
 *  — edits to hours, bonuses or disconnections for that period are then
 *  refused so an approved/paid statement never silently drifts from what the
 *  live numbers would now show. */
export async function isPeriodLocked(periodStart: Date): Promise<boolean> {
  const run = await prisma.payRun.findUnique({
    where: { periodStart },
    select: { status: true },
  });
  return run?.status === 'approved' || run?.status === 'paid';
}
