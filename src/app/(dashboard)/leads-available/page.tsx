'use client';

import { useMemo, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useLeadAvailability } from '@/hooks/use-lead-availability';

const nf = new Intl.NumberFormat('en-US');

/** Below this an industry is close enough to empty to call out. */
const LOW_WATER_MARK = 1000;

export default function LeadsAvailablePage() {
  const [zone, setZone] = useState<string>('all');
  const [filter, setFilter] = useState('');

  const { data, isPending, isFetching, refetch } = useLeadAvailability(zone);

  const shown = useMemo(() => {
    const rows = data?.industries ?? [];
    const q = filter.trim().toLowerCase();
    return q ? rows.filter((row) => row.label.toLowerCase().includes(q)) : rows;
  }, [data, filter]);

  const scopeLabel = zone === 'all' ? 'all timezones' : zone;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Leads Available
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Ready to call right now, counted the way the Calls page hands work out: by timezone,
            then by industry.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isPending ? (
        <div className="flex justify-center p-16">
          <Loading />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Could not load availability.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Headline plus the zone breakdown. Selecting a zone rescopes the
              industry table below, which is the pair an agent actually filters on. */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-6 p-6">
              <div>
                <div
                  className="text-4xl font-bold tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {nf.format(data.total)}
                </div>
                <div
                  className="mt-1 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Ready to call
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <ZoneChip
                  label="All"
                  total={data.total}
                  active={zone === 'all'}
                  onClick={() => setZone('all')}
                />
                {data.byZone.map((row) => (
                  <ZoneChip
                    key={row.label}
                    label={row.label}
                    total={row.total}
                    active={zone === row.label}
                    onClick={() => setZone(row.label)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
              <CardTitle>
                Industries in {scopeLabel}
                <span
                  className="ml-2 text-sm font-normal tabular-nums"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {nf.format(data.scopedTotal)} leads
                </span>
              </CardTitle>
              <div className="relative w-full max-w-xs">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: 'var(--text-secondary)' }}
                />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter industries"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)' }}>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">
                        Industry
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">
                        Available
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => (
                      <tr key={row.label} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-3 py-2.5" style={{ color: 'var(--text-primary)' }}>
                          {row.label}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right font-medium tabular-nums"
                          style={{
                            color: row.total < LOW_WATER_MARK ? 'var(--danger)' : 'var(--text-primary)',
                          }}
                        >
                          {nf.format(row.total)}
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr>
                        <td
                          colSpan={2}
                          className="px-3 py-6 text-center"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          No industry matches that filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!filter && (data.otherIndustries || data.unspecified > 0) && (
                <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {data.otherIndustries && (
                    <>
                      Plus {nf.format(data.otherIndustries.total)} leads across{' '}
                      {data.otherIndustries.count} smaller industries.
                    </>
                  )}
                  {data.unspecified > 0 && (
                    <>
                      {' '}
                      {nf.format(data.unspecified)} more have no industry recorded and can only be
                      reached with the industry filter left on Random.
                    </>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ZoneChip({
  label,
  total,
  active,
  onClick,
}: {
  label: string;
  total: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-4 py-2 text-left transition-colors"
      style={{
        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {nf.format(total)}
      </div>
    </button>
  );
}
