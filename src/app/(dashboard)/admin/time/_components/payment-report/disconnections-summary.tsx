'use client';

import { Badge } from '@/components/ui/badge';
import type { DisconnectionsResponse, DisconnectionType, WeekTotals } from '@/hooks/use-admin-time';
import { formatTime, formatDuration } from '../../_lib/format';
import { DISCONNECTION_TYPE_LABELS } from '../../_lib/constants';

interface DisconnectionsSummaryProps {
  disconnections: DisconnectionsResponse;
  totals: WeekTotals | undefined;
}

/** Counts by type, then one line per disconnection in the period. */
export function DisconnectionsSummary({ disconnections, totals }: DisconnectionsSummaryProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold print:mb-1 print:text-[10px]" style={{ color: 'var(--text-primary)' }}>
        Disconnections
        {(totals?.disconnectedMinutes ?? 0) > 0 && (
          <span className="ml-2 font-normal text-red-500">
            ({formatDuration(Math.round(totals?.disconnectedMinutes ?? 0))} deducted from paid hours)
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-2 print:gap-1">
        {(Object.keys(DISCONNECTION_TYPE_LABELS) as DisconnectionType[])
          .filter((type) => disconnections.counts[type] > 0)
          .map((type) => (
            <Badge key={type} variant="outline" className="print:px-[5px] print:py-0 print:text-[7.5px]">
              {DISCONNECTION_TYPE_LABELS[type]}: {disconnections.counts[type]}
            </Badge>
          ))}
      </div>
      <div className="mt-3 space-y-1 print:mt-1 print:space-y-0">
        {disconnections.data.map((d) => (
          <p key={d.id} className="text-xs print:text-[8px]" style={{ color: 'var(--text-muted)' }}>
            {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' · '}
            {formatTime(d.startTime)} – {d.endTime ? formatTime(d.endTime) : 'not reconnected (until clock-out)'}
            {d.durationMinutes != null && ` (${formatDuration(d.durationMinutes)})`}
            {' — '}
            {DISCONNECTION_TYPE_LABELS[d.type]}
            {d.reason && `: ${d.reason}`}
          </p>
        ))}
      </div>
    </div>
  );
}
