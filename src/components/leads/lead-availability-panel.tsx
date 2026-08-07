'use client';

import { AlertCircle, ArrowRight } from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import { useLeadAvailability } from '@/hooks/use-lead-availability';

interface LeadAvailabilityPanelProps {
  /** The zone the agent was filtering on when the request came back empty. */
  timezone: string;
  /** The industry they had selected, if any. */
  industry?: string;
  /** Switches the filters to this industry and pulls a lead straight away. */
  onPickIndustry: (industry: string) => void;
}

const INDUSTRIES_SHOWN = 8;

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Shown in place of "No leads available for the selected filters."
 *
 * That message was the whole of what an agent got, and it does not say which
 * filters would have worked — so the agent reports that the system is out of
 * leads. The pool is never empty in aggregate; their one cell of it is. This
 * lists the cells that are not, and switches them over on a click.
 */
export function LeadAvailabilityPanel({
  timezone,
  industry,
  onPickIndustry,
}: LeadAvailabilityPanelProps) {
  const { data, isPending, isError } = useLeadAvailability(timezone);

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loading />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Could not load what is available right now. Try another industry, or ask an admin to check.
      </p>
    );
  }

  const options = data.industries.filter((row) => row.total > 0).slice(0, INDUSTRIES_SHOWN);
  const zoneIsDry = data.scopedTotal === 0;

  return (
    <div className="w-full max-w-xl">
      <div
        className="mb-4 flex items-start gap-3 rounded-xl p-4"
        style={{ backgroundColor: 'var(--accent-subtle)' }}
      >
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--accent)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {industry
              ? `No ${industry} leads left in ${timezone}.`
              : `No leads left in ${timezone} for those filters.`}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {zoneIsDry
              ? `${timezone} is completely out. There are ${formatCount(data.total)} leads in other timezones.`
              : `${timezone} still has ${formatCount(data.scopedTotal)} leads in other industries.`}
          </p>
        </div>
      </div>

      {options.length > 0 && (
        <>
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            Pick one of these instead
          </p>
          <ul className="mb-4 flex flex-col gap-1">
            {options.map((row) => (
              <li key={row.label}>
                <button
                  type="button"
                  onClick={() => onPickIndustry(row.label)}
                  className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {row.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className="text-sm tabular-nums"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {formatCount(row.total)}
                    </span>
                    <ArrowRight className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {zoneIsDry && data.byZone.some((row) => row.total > 0) && (
        <div>
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            Leads by timezone
          </p>
          <div className="flex flex-wrap gap-2">
            {data.byZone.map((row) => (
              <span
                key={row.label}
                className="rounded-full px-3 py-1 text-xs font-medium tabular-nums"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: row.total === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
                }}
              >
                {row.label} {formatCount(row.total)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
