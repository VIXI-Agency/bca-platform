import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { timeEditSchema } from '@/lib/validators';
import { timeStringToUtcDate } from '@/lib/time';

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

    if (role !== 1 && role !== 2) {
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
    const targetDateEnd = new Date(targetDate);
    targetDateEnd.setDate(targetDateEnd.getDate() + 1);

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

    // Chronological validation: ensure time fields are in order
    // (null entries are ignored, so clearing a field never breaks the order)
    const TIME_ORDER = [
      'clockIn', 'firstBreakOut', 'firstBreakIn',
      'lunchOut', 'lunchIn',
      'secondBreakOut', 'secondBreakIn', 'clockOut',
    ];
    const fieldIdx = TIME_ORDER.indexOf(field);
    const proposed = { ...log, [field]: newDateTime } as unknown as Record<string, Date | null>;
    for (let i = 0; i < TIME_ORDER.length - 1; i++) {
      const a = proposed[TIME_ORDER[i]] as Date | null;
      const b = proposed[TIME_ORDER[i + 1]] as Date | null;
      if (a && b && a.getTime() > b.getTime()) {
        return NextResponse.json(
          { error: `${TIME_ORDER[i]} cannot be after ${TIME_ORDER[i + 1]}` },
          { status: 400 },
        );
      }
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
