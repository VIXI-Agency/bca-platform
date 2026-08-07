'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { useRunHistory } from '@/hooks/use-scrape';
import { describeRun, OUTCOME_GROUP_LABELS, type OutcomeGroup } from '@/lib/scrape-outcomes';
import { RunDetail } from './run-detail';

const nf = new Intl.NumberFormat('en-US');

const FILTERS: OutcomeGroup[] = ['all', 'productive', 'aborted', 'idle'];

const TONE_VARIANT = {
  good: 'success',
  neutral: 'outline',
  bad: 'destructive',
} as const;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Run history with the context a single row cannot carry.
 *
 * The previous version listed ten runs, labelled them with the worker's own
 * words ('drift', 'budget'), and stopped there: no way to reach an older run,
 * no total to compare against, and no way to learn what a run had imported.
 */
export function RunHistory() {
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<OutcomeGroup>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isPending } = useRunHistory(page, outcome);

  const changeFilter = (next: OutcomeGroup) => {
    setOutcome(next);
    setPage(1);
    setExpanded(null);
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">Run history</CardTitle>

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Leads imported" value={nf.format(data.summary.imported)} accent />
              <Stat label="Across runs" value={nf.format(data.summary.runs)} />
              <Stat label="Avg per run" value={nf.format(data.summary.importedPerRun)} />
              <Stat label="Already on file" value={`${data.summary.duplicateRate}%`} />
            </div>
            <p className="text-muted-foreground text-xs">
              All time, from {nf.format(data.summary.searches)} searches that found{' '}
              {nf.format(data.summary.found)} listings. {nf.format(data.summary.blacklisted)} were
              blacklisted.
            </p>
          </>
        )}

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={outcome === key ? 'default' : 'outline'}
              onClick={() => changeFilter(key)}
            >
              {OUTCOME_GROUP_LABELS[key]}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {isPending ? (
          <div className="flex justify-center p-8">
            <Loading />
          </div>
        ) : !data?.runs.length ? (
          <p className="text-muted-foreground text-sm">No runs match this filter.</p>
        ) : (
          <>
            <div className="divide-y">
              {data.runs.map((run) => {
                const info = describeRun(run.status, run.finishReason);
                const isOpen = expanded === run.id;
                return (
                  <div key={run.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : run.id)}
                      className="flex w-full flex-wrap items-center gap-2 py-2.5 text-left text-sm hover:opacity-80"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <Badge variant={TONE_VARIANT[info.tone]} title={info.explanation}>
                        {info.label}
                      </Badge>
                      <span className="text-muted-foreground">{formatWhen(run.startedAt)}</span>
                      <span className="ml-auto tabular-nums">
                        <span className="font-semibold text-emerald-600">
                          {nf.format(run.leadsImported)}
                        </span>{' '}
                        imported ·{' '}
                        <span className="text-muted-foreground">
                          {nf.format(run.tasksDone)} searches · {nf.format(run.duplicates)} already
                          on file
                        </span>
                      </span>
                    </button>
                    {isOpen && <RunDetail runId={run.id} />}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                Showing {(data.page - 1) * data.pageSize + 1}–
                {Math.min(data.page * data.pageSize, data.total)} of {nf.format(data.total)}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.page <= 1}
                  onClick={() => {
                    setPage((p) => p - 1);
                    setExpanded(null);
                  }}
                >
                  <ChevronLeft className="mr-1 h-3 w-3" /> Newer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.page >= data.totalPages}
                  onClick={() => {
                    setPage((p) => p + 1);
                    setExpanded(null);
                  }}
                >
                  Older <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-emerald-600' : ''}`}>
        {value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
