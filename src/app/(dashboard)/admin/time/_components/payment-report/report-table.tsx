'use client';

import { Pencil } from 'lucide-react';
import type { DayLog, WeekTotals } from '@/hooks/use-admin-time';
import { formatTime, formatDuration } from '../../_lib/format';

interface ReportTableProps {
  dayLogs: DayLog[];
  totals: WeekTotals | undefined;
}

/** One row per day of the pay period, with the period totals underneath. */
export function ReportTable({ dayLogs, totals }: ReportTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm print:text-[9px]">
        <thead>
          <tr
            className="border-b text-left text-xs font-medium uppercase tracking-wider print:text-[7.5px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <th className="pb-2 pr-3 print:pb-[3px] print:pr-[6px]">Day</th>
            <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">Clock In</th>
            <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">1st Break</th>
            <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">Lunch</th>
            <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">2nd Break</th>
            <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">Clock Out</th>
            <th className="pb-2 px-3 text-right print:pb-[3px] print:px-[6px]">Total</th>
            <th className="pb-2 pl-3 text-right print:pb-[3px] print:pl-[6px]">OT</th>
          </tr>
        </thead>
        <tbody>
          {dayLogs.map((day) => {
            const dayDate = new Date(day.date + 'T00:00:00');
            const dayLabel = `${dayDate.toLocaleDateString('en-US', { weekday: 'short' })} ${dayDate.getMonth() + 1}/${dayDate.getDate()}`;
            const wasModified = day.isModifiedByAdmin || (day.modifiedFields?.length ?? 0) > 0;
            return (
              <tr key={day.date} className="border-b" style={{ borderColor: 'var(--border)' }}>
                <td className="py-2 pr-3 font-medium print:py-[3px] print:pr-[6px]" style={{ color: 'var(--text-primary)' }}>
                  <span className="inline-flex items-center gap-1.5">
                    {dayLabel}
                    {wasModified && (
                      <Pencil
                        className="h-3 w-3 shrink-0 print:h-[7px] print:w-[7px]"
                        style={{ color: 'var(--accent)' }}
                        aria-label="Modified by admin"
                      />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>{formatTime(day.clockIn)}</td>
                <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>
                  {day.firstBreakOut ? `${formatTime(day.firstBreakOut)} - ${formatTime(day.firstBreakIn)}` : '--'}
                </td>
                <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>
                  {day.lunchOut ? `${formatTime(day.lunchOut)} - ${formatTime(day.lunchIn)}` : '--'}
                </td>
                <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>
                  {day.secondBreakOut ? `${formatTime(day.secondBreakOut)} - ${formatTime(day.secondBreakIn)}` : '--'}
                </td>
                <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>{formatTime(day.clockOut)}</td>
                <td className="px-3 py-2 text-right font-medium print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-primary)' }}>
                  {day.totalHours != null ? formatDuration(Math.round(day.totalHours * 60)) : '--'}
                  {(day.disconnectedMinutes ?? 0) > 0 && (
                    <span className="block text-xs font-normal text-red-500 print:text-[7px]">
                      −{formatDuration(Math.round(day.disconnectedMinutes ?? 0))} disc.
                    </span>
                  )}
                </td>
                <td className="pl-3 py-2 text-right print:pl-[6px] print:py-[3px]" style={{ color: day.overtime ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {day.overtime ? formatDuration(Math.round(day.overtime * 60)) : '--'}
                </td>
              </tr>
            );
          })}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: 'var(--border)' }}>
              <td colSpan={6} className="py-2 text-right text-sm font-semibold print:py-[4px] print:text-[9px]" style={{ color: 'var(--text-primary)' }}>
                Totals
              </td>
              <td className="py-2 px-3 text-right text-sm font-bold print:py-[4px] print:px-[6px] print:text-[9px]" style={{ color: 'var(--text-primary)' }}>
                {formatDuration(Math.round(totals.totalHours * 60))}
              </td>
              <td className="py-2 pl-3 text-right text-sm font-bold print:py-[4px] print:pl-[6px] print:text-[9px]" style={{ color: 'var(--accent)' }}>
                {formatDuration(Math.round(totals.overtime * 60))}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
