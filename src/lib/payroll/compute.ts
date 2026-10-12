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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Computes one day's paid hours from raw punch times. This is the single
 * source of truth for the math — it used to be copied verbatim in two API
 * routes (admin time + employee clock), which could silently drift apart.
 *
 * Overtime here is daily-only (anything past 8h/day, capped at 8h regular) —
 * there is no weekly 40h rule. Weekend logs are filtered out upstream by the
 * caller, not here.
 */
export function computeDayMetrics(log: TimeLogRow): DayMetrics {
  let totalHours = 0;
  let overtime = 0;
  let firstBreakExcess = 0;
  let secondBreakExcess = 0;
  let lunchDurationMinutes = 0;

  if (log.clockIn && log.clockOut) {
    const clockInMs = new Date(log.clockIn).getTime();
    let clockOutMs = new Date(log.clockOut).getTime();
    // Handle overnight shifts: if clockOut is before clockIn, add 24 hours
    if (clockOutMs <= clockInMs) {
      clockOutMs += 24 * 60 * 60 * 1000;
    }

    let lunchMs = 0;
    if (log.lunchOut && log.lunchIn) {
      const lunchOutMs = new Date(log.lunchOut).getTime();
      let lunchInMs = new Date(log.lunchIn).getTime();
      if (lunchInMs < lunchOutMs) lunchInMs += 24 * 60 * 60 * 1000;
      lunchMs = lunchInMs - lunchOutMs;
      lunchDurationMinutes = lunchMs / (1000 * 60);
    }

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

    const rawMs = clockOutMs - clockInMs - lunchMs;
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
  };
}

export interface PeriodHours {
  totalHours: number;
  overtime: number;
  firstBreakExcess: number;
  secondBreakExcess: number;
}

/** Sums computeDayMetrics across every weekday log in [periodStart, periodStart+7). */
export async function computePeriodHours(userId: number, periodStart: Date): Promise<PeriodHours> {
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 7);

  const logs = await prisma.employeeTimeLog.findMany({
    where: { idUser: userId, logDate: { gte: periodStart, lt: periodEnd } },
  });

  const weekdayLogs = logs.filter((log) => {
    const day = new Date(log.logDate).getUTCDay();
    return day !== 0 && day !== 6;
  });

  const days = weekdayLogs.map((log) => computeDayMetrics(log));

  return {
    totalHours: round2(days.reduce((sum, d) => sum + d.totalHours, 0)),
    overtime: round2(days.reduce((sum, d) => sum + d.overtime, 0)),
    firstBreakExcess: round2(days.reduce((sum, d) => sum + d.firstBreakExcess, 0)),
    secondBreakExcess: round2(days.reduce((sum, d) => sum + d.secondBreakExcess, 0)),
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
