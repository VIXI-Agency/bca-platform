'use client';

import { Loading } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { useRunDetail } from '@/hooks/use-scrape';

const nf = new Intl.NumberFormat('en-US');

/** Below this an industry burned searches without earning its place. */
const POOR_YIELD = 0.05;

interface RunDetailProps {
  runId: number;
}

/**
 * The breakdown behind a run's headline number.
 *
 * Answers the questions the summary row cannot: which industries those leads
 * came from, which cities, and which searches failed. The yield column is the
 * one that changes behaviour — an industry that spends 231 searches to import
 * one lead should not be queued again, and nothing said so before.
 */
export function RunDetail({ runId }: RunDetailProps) {
  const { data, isPending, isError } = useRunDetail(runId);

  if (isPending) {
    return (
      <div className="flex justify-center p-6">
        <Loading />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-muted-foreground p-4 text-sm">Could not load this run.</p>;
  }

  if (data.industries.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        This run completed no searches, so there is nothing to break down. Its tasks were left
        queued for the next run.
      </p>
    );
  }

  return (
    <div className="space-y-5 px-1 py-4">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Industries searched
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs uppercase tracking-wider">
                <th className="py-1.5 pr-3 text-left font-medium">Industry</th>
                <th className="px-3 py-1.5 text-right font-medium">Searches</th>
                <th className="px-3 py-1.5 text-right font-medium">Found</th>
                <th className="px-3 py-1.5 text-right font-medium">Imported</th>
                <th className="py-1.5 pl-3 text-right font-medium">Per search</th>
              </tr>
            </thead>
            <tbody>
              {data.industries.map((row) => {
                const perSearch = row.searches > 0 ? row.imported / row.searches : 0;
                return (
                  <tr key={row.industry} className="border-t">
                    <td className="py-2 pr-3 font-medium">{row.industry}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf.format(row.searches)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf.format(row.found)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600">
                      {nf.format(row.imported)}
                    </td>
                    <td
                      className={`py-2 pl-3 text-right tabular-nums ${
                        perSearch < POOR_YIELD ? 'font-semibold text-red-600' : 'text-muted-foreground'
                      }`}
                    >
                      {perSearch.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Per search is leads imported for every search spent. Anything under {POOR_YIELD.toFixed(2)}
          {' '}is costing more time than it returns — consider not queueing it again.
        </p>
      </div>

      {data.zones.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Where the leads landed
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.zones.map((zone) => (
              <Badge key={zone.timeZone} variant="outline" className="tabular-nums">
                {zone.timeZone}: {nf.format(zone.imported)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {data.cities.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Top cities
          </h4>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {data.cities.map((city) => (
              <span key={`${city.city}-${city.state}`}>
                {city.city}, {city.state}{' '}
                <span className="font-semibold tabular-nums">{nf.format(city.imported)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {data.failures.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-600">
            Searches that failed in this run
          </h4>
          <ul className="space-y-1 text-sm">
            {data.failures.map((task) => (
              <li key={task.id}>
                {task.industry} in {task.city}, {task.state}
                <span className="text-muted-foreground text-xs">
                  {' '}— {task.attempts} attempts, {task.lastError ?? 'no detail'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
