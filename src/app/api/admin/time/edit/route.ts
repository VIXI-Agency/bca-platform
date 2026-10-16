import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { timeEditSchema } from '@/lib/validators';
import { timeStringToUtcDate, getPayPeriodStart, addDaysUTC } from '@/lib/time';
import { isPeriodLocked } from '@/lib/payroll/compute';
import { breakOrderFor, punchOrderError } from '@/lib/clock/break-order';
import type { ClockAction } from '@/types';

const VALID_FIELDS = [
  'clockIn',
  'firstBreakOut',
  'firstBreakIn',
  'lunchOut',
  'lunchIn',
  'secondBreakOut',
  'secondBreakIn',
  'clockOut',
];

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    const adminUserId = (session.user as { userId: number }).userId;

    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = timeEditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { userId, date, field, value, reason } = parsed.data;

    // Validate field name
    if (!VALID_FIELDS.includes(field)) {
      return NextResponse.json(
        { error: `Invalid field: ${field}. Must be one of: ${VALID_FIELDS.join(', ')}` },
        { status: 400 }
      );
    }

    // An empty value clears the entry (e.g. a break/lunch the employee never took).
    const isClearing = value.trim() === '';

    // Validate time format (HH:mm) when a value is provided
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!isClearing && !timeRegex.test(value)) {
      return NextResponse.json(
        { error: 'Value must be in HH:mm format' },
        { status: 400 }
      );
    }

    // Parse the target date as UTC midnight (matches logDate storage convention)
    const dateParts = date.split('-').map(Number);
    const targetDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
    const targetDateEnd = addDaysUTC(targetDate, 1);

    if (await isPeriodLocked(getPayPeriodStart(targetDate))) {
      return NextResponse.json(
        { error: 'This pay period has been approved or paid and can no longer be edited.' },
        { status: 409 }
      );
    }

    // Find the time log for this user and date
    const log = await prisma.employeeTimeLog.findFirst({
      where: {
        idUser: userId,
        logDate: {
          gte: targetDate,
          lt: targetDateEnd,
        },
      },
    });

    if (!log) {
      // No entry exists for this date — e.g. the employee forgot to clock in
      // at all, so the clock flow never created a row. Clearing a field that
      // doesn't exist is a no-op, but for a real value we create the day's log
      // with that single field set so an admin can add the missed hours.
      if (isClearing) {
        return NextResponse.json(
          { error: 'No time log found for this user on this date' },
          { status: 404 }
        );
      }

      const createdValue = timeStringToUtcDate(value);
      const createdLog = await prisma.$transaction(async (tx) => {
        const created = await tx.employeeTimeLog.create({
          data: {
            idUser: userId,
            logDate: targetDate,
            [field]: createdValue,
            isModifiedByAdmin: true,
          },
        });
        await tx.employeeTimeLogAudit.create({
          data: {
            timeLogId: created.timeLogId,
            idUser: String(userId),
            modifiedBy: String(adminUserId),
            modifiedDate: new Date(),
            fieldModified: field,
            oldValue: null,
            newValue: createdValue,
            reason,
          },
        });
        return created;
      });

      return NextResponse.json({ data: createdLog });
    }

    // Get the current (old) value for the audit trail
    const oldValueRaw = log[field as keyof typeof log] as Date | null;

    // Build UTC-epoch Date where UTC hours = PST hours (for TIME column storage),
    // or null when clearing the entry.
    const newDateTime = isClearing ? null : timeStringToUtcDate(value);

    // Chronological validation in this employee's own break order (Janice
    // takes lunch first). Blank entries are ignored, so clearing a field
    // never breaks the order.
    const employee = await prisma.user.findUnique({
      where: { idUser: userId },
      select: { isPartTime: true, breakOrder: true },
    });
    const proposed = { ...log, [field]: newDateTime } as unknown as Record<ClockAction, Date | null>;
    const orderError = punchOrderError(proposed, breakOrderFor(employee?.breakOrder, employee?.isPartTime === true));
    if (orderError) {
      return NextResponse.json({ error: orderError }, { status: 400 });
    }

    // There are no overnight shifts, so a day whose clock-out isn't after its
    // clock-in pays nothing (computeDayMetrics) — refuse to save one.
    if (proposed.clockIn && proposed.clockOut && proposed.clockOut.getTime() <= proposed.clockIn.getTime()) {
      return NextResponse.json(
        { error: 'clockOut must be later than clockIn' },
        { status: 400 },
      );
    }

    // Update the time log and create audit record in a transaction
    const [updatedLog] = await prisma.$transaction([
      prisma.employeeTimeLog.update({
        where: { timeLogId: log.timeLogId },
        data: {
          [field]: newDateTime,
          isModifiedByAdmin: true,
        },
      }),
      prisma.employeeTimeLogAudit.create({
        data: {
          timeLogId: log.timeLogId,
          idUser: String(userId),
          modifiedBy: String(adminUserId),
          modifiedDate: new Date(),
          fieldModified: field,
          oldValue: oldValueRaw,
          newValue: newDateTime,
          reason,
        },
      }),
    ]);

    return NextResponse.json({ data: updatedLog });
  } catch (error) {
    console.error('Admin time edit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
