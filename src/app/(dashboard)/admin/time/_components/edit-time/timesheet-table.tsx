'use client';

import type { DayLog } from '@/hooks/use-admin-time';
import { formatTime, breakMinutes, formatDuration } from '../../_lib/format';
import { TimeCell, BreakCell } from '../time-cells';

/** Compute break duration and whether it exceeds 10 minutes. */
function breakInfo(
  out?: string | null,
  inTime?: string | null
): { text: string; exceeded: boolean } {
  const mins = breakMinutes(out, inTime);
  if (mins === null) return { text: '--', exceeded: false };
  return { text: `${mins} min`, exceeded: mins > 10 };
}

interface TimesheetTableProps {
  dayLogs: DayLog[];
  openEditDialog: (day: DayLog, field: string) => void;
}

/** One row per day; every time is a button that opens the edit dialog. */
export function TimesheetTable({ dayLogs, openEditDialog }: TimesheetTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b text-left text-xs font-medium uppercase tracking-wider"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <th className="pb-3 pr-3">Day</th>
            <th className="pb-3 px-3">Clock In</th>
            <th className="pb-3 px-3">1st Break</th>
            <th className="pb-3 px-3">Lunch</th>
            <th className="pb-3 px-3">2nd Break</th>
            <th className="pb-3 px-3">Clock Out</th>
            <th className="pb-3 pl-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {dayLogs.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="py-8 text-center text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                No time entries for this week.
              </td>
            </tr>
          )}
          {dayLogs.map((day) => {
            const dayDate = new Date(day.date + 'T00:00:00');
            // Derive the weekday name from the actual date (robust to missing days)
            const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
            const dayLabel = `${dayName} ${dayDate.getMonth() + 1}/${dayDate.getDate()}`;

            const break1 = breakInfo(
              day.firstBreakOut,
              day.firstBreakIn
            );
            const break2 = breakInfo(
              day.secondBreakOut,
              day.secondBreakIn
            );
            const lunch = breakInfo(day.lunchOut, day.lunchIn);

            const modified = new Set(day.modifiedFields ?? []);

            return (
              <tr
                key={day.date}
                className="border-b transition-colors hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                {/* Day */}
                <td
                  className="py-3 pr-3 font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {dayLabel}
                </td>

                {/* Clock In */}
                <td className="px-3 py-3">
                  <TimeCell
                    value={formatTime(day.clockIn)}
                    modified={modified.has('clockIn')}
                    onClick={() => openEditDialog(day, 'clockIn')}
                  />
                </td>

                {/* 1st Break */}
                <td className="px-3 py-3">
                  <BreakCell
                    outValue={formatTime(day.firstBreakOut)}
                    inValue={formatTime(day.firstBreakIn)}
                    duration={break1.text}
                    exceeded={break1.exceeded}
                    modifiedOut={modified.has('firstBreakOut')}
                    modifiedIn={modified.has('firstBreakIn')}
                    onClickOut={() =>
                      openEditDialog(day, 'firstBreakOut')
                    }
                    onClickIn={() =>
                      openEditDialog(day, 'firstBreakIn')
                    }
                  />
                </td>

                {/* Lunch */}
                <td className="px-3 py-3">
                  <BreakCell
                    outValue={formatTime(day.lunchOut)}
                    inValue={formatTime(day.lunchIn)}
                    duration={lunch.text}
                    exceeded={false}
                    modifiedOut={modified.has('lunchOut')}
                    modifiedIn={modified.has('lunchIn')}
                    onClickOut={() =>
                      openEditDialog(day, 'lunchOut')
                    }
                    onClickIn={() =>
                      openEditDialog(day, 'lunchIn')
                    }
                  />
                </td>

                {/* 2nd Break */}
                <td className="px-3 py-3">
                  <BreakCell
                    outValue={formatTime(day.secondBreakOut)}
                    inValue={formatTime(day.secondBreakIn)}
                    duration={break2.text}
                    exceeded={break2.exceeded}
                    modifiedOut={modified.has('secondBreakOut')}
                    modifiedIn={modified.has('secondBreakIn')}
                    onClickOut={() =>
                      openEditDialog(day, 'secondBreakOut')
                    }
                    onClickIn={() =>
                      openEditDialog(day, 'secondBreakIn')
                    }
                  />
                </td>

                {/* Clock Out */}
                <td className="px-3 py-3">
                  <TimeCell
                    value={formatTime(day.clockOut)}
                    modified={modified.has('clockOut')}
                    onClick={() => openEditDialog(day, 'clockOut')}
                  />
                </td>

                {/* Total */}
                <td
                  className="py-3 pl-3 text-right font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {day.totalHours != null
                    ? formatDuration(Math.round(day.totalHours * 60))
                    : '--'}
                  {(day.overtime ?? 0) > 0 && (
                    <span className="block text-xs font-normal" style={{ color: 'var(--accent)' }}>
                      +{formatDuration(Math.round((day.overtime ?? 0) * 60))} OT
                    </span>
                  )}
                  {(day.disconnectedMinutes ?? 0) > 0 && (
                    <span className="block text-xs font-normal text-red-500">
                      −{formatDuration(Math.round(day.disconnectedMinutes ?? 0))} disconnected
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
