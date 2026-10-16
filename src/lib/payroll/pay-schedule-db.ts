// Server-side: loads employees' pay-week history and resolves their periods.
import { prisma } from '@/lib/prisma';
import { getTodayRangePST, parseDateParam } from '@/lib/time';
import { periodContaining, type PayPeriod, type PaySchedule, type ScheduleChange } from './pay-schedule';

const toChange = (row: { schedule: string; effectiveFrom: Date }): ScheduleChange => ({
  schedule: row.schedule as PaySchedule,
  effectiveFrom: row.effectiveFrom,
});

/** One employee's pay-week changes (empty = always remote). */
export async function payScheduleHistory(userId: number): Promise<ScheduleChange[]> {
  const rows = await prisma.userPaySchedule.findMany({
    where: { idUser: userId },
    select: { schedule: true, effectiveFrom: true },
  });
  return rows.map(toChange);
}

/** Pay-week changes for several employees at once, keyed by user id. */
export async function payScheduleHistories(userIds: number[]): Promise<Map<number, ScheduleChange[]>> {
  const rows = await prisma.userPaySchedule.findMany({
    where: { idUser: { in: userIds } },
    select: { idUser: true, schedule: true, effectiveFrom: true },
  });
  const byUser = new Map<number, ScheduleChange[]>(userIds.map((id) => [id, []]));
  for (const row of rows) byUser.get(row.idUser)?.push(toChange(row));
  return byUser;
}

/** The employee's pay period containing `day`. */
export async function userPeriodContaining(userId: number, day: Date): Promise<PayPeriod> {
  return periodContaining(await payScheduleHistory(userId), day);
}

/** The employee's pay period for a `week` query param (any day in it), or today's when absent. */
export async function resolveUserPeriod(userId: number, week: string | null | undefined): Promise<PayPeriod> {
  return userPeriodContaining(userId, week ? parseDateParam(week) : getTodayRangePST().todayStart);
}
