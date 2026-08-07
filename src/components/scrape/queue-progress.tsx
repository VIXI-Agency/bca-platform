'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRunHistory } from '@/hooks/use-scrape';

const nf = new Intl.NumberFormat('en-US');

/** At or below this many days of queue left, say so loudly. */
const RUNWAY_WARNING_DAYS = 3;

/**
 * How much work is left and how long it lasts.
 *
 * The queue draining is silent: runs keep finishing successfully, they simply
 * import nothing, and the only clue is a "Queue empty" label after the fact.
 * This turns the pending count into the number an admin can act on — days.
 */
export function QueueProgress() {
  // Shares the cache with RunHistory's unfiltered first page, so the two cards
  // always agree and only one request is made.
  const { data } = useRunHistory(1, 'all');

  if (!data) return null;

  const { queue, worstIndustries } = data;
  const low = queue.daysRemaining !== null && queue.daysRemaining <= RUNWAY_WARNING_DAYS;
  const empty = queue.pending === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Queue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-3xl font-bold tabular-nums">{nf.format(queue.pending)}</span>
            <span className="text-muted-foreground text-sm">searches left</span>
          </div>

          {empty ? (
            <p className="mt-2 text-sm font-medium text-red-600">
              The queue is empty. Every run from here imports nothing until you queue more
              industries and states above.
            </p>
          ) : queue.daysRemaining !== null ? (
            <p className={`mt-2 text-sm ${low ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>
              About {nf.format(queue.runsRemaining ?? 0)} more runs — roughly{' '}
              <strong>{queue.daysRemaining === 0 ? 'less than a day' : `${queue.daysRemaining} days`}</strong>{' '}
              at 4 runs a day and {nf.format(queue.searchesPerRun)} searches each.
              {low && ' Queue more work before it runs dry.'}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="font-semibold tabular-nums">{nf.format(queue.done)}</div>
            <div className="text-muted-foreground text-xs">Completed</div>
          </div>
          <div>
            <div className="font-semibold tabular-nums">{nf.format(queue.industriesRemaining)}</div>
            <div className="text-muted-foreground text-xs">Industries left</div>
          </div>
          <div>
            <div className={`font-semibold tabular-nums ${queue.failed ? 'text-red-600' : ''}`}>
              {nf.format(queue.failed)}
            </div>
            <div className="text-muted-foreground text-xs">Failed</div>
          </div>
        </div>

        {queue.nextIndustry && (
          <p className="text-muted-foreground text-xs">
            Working through <strong className="text-foreground">{queue.nextIndustry}</strong> next.
            Runs cover one industry across every city before moving to the next, so new leads arrive
            concentrated in whichever industry the queue has reached.
          </p>
        )}

        {worstIndustries.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> Weakest earners so far
            </h4>
            <ul className="space-y-1 text-sm">
              {worstIndustries.map((row) => (
                <li key={row.industry} className="flex justify-between gap-3">
                  <span>{row.industry}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {nf.format(row.searches)} searches → {nf.format(row.imported)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2 text-xs">
              These cost the most time for the least return. Leaving them out of the next request
              frees the queue for industries that pay.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
