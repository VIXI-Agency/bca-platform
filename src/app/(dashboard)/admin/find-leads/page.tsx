'use client';

import { useMemo, useState } from 'react';
import { Search, Pause, Play, X, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SOURCE_LABELS } from '@/lib/scrape-outcomes';
import { RunHistory } from '@/components/scrape/run-history';
import { QueueProgress } from '@/components/scrape/queue-progress';
import {
  type ScrapeSource,
  useScrapeCatalog,
  useScrapeOverview,
  usePreviewRequest,
  useCreateRequest,
  useUpdateRequest,
  useCancelRequest,
  useRetryTasks,
} from '@/hooks/use-scrape';

const nf = new Intl.NumberFormat('en-US');

const SOURCE_OPTIONS: { label: string; value: ScrapeSource[] }[] = [
  { label: 'YellowPages', value: ['yp'] },
  { label: 'SuperPages', value: ['sp'] },
  { label: 'Both', value: ['yp', 'sp'] },
];

/** Order-insensitive, so ['sp','yp'] still highlights Both. */
function sameSources(a: ScrapeSource[], b: ScrapeSource[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export default function FindLeadsPage() {
  const catalog = useScrapeCatalog();
  const overview = useScrapeOverview();
  const preview = usePreviewRequest();
  const create = useCreateRequest();
  const update = useUpdateRequest();
  const cancel = useCancelRequest();
  const retry = useRetryTasks();

  const [industries, setIndustries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [maxPages, setMaxPages] = useState(3);
  const [sources, setSources] = useState<ScrapeSource[]>(['yp']);
  const [filter, setFilter] = useState('');

  const shownIndustries = useMemo(() => {
    const all = catalog.data?.industries ?? [];
    const q = filter.trim().toLowerCase();
    return q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all;
  }, [catalog.data, filter]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const allStatesSelected =
    (catalog.data?.states.length ?? 0) > 0 && states.length === catalog.data!.states.length;

  const allShownSelected =
    shownIndustries.length > 0 && shownIndustries.every((i) => industries.includes(i.name));

  // Acts on the filtered list, not the catalog: filter "Air", select the six
  // matches, clear the filter, and they stay selected.
  function toggleShownIndustries() {
    const shown = shownIndustries.map((i) => i.name);
    setIndustries(
      allShownSelected
        ? industries.filter((n) => !shown.includes(n))
        : [...new Set([...industries, ...shown])],
    );
  }

  const canSubmit = industries.length > 0 && states.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Find New Leads</h1>
        <p className="text-muted-foreground text-sm">
          Queue industries and states for the overnight scraper. Work is picked up on the next run.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> New request
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Industries ({industries.length} selected)</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={toggleShownIndustries}>
                    {allShownSelected ? 'Deselect' : 'Select'} all
                    {filter.trim() && ` (${shownIndustries.length})`}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIndustries([])}>Clear</Button>
                </div>
              </div>
              <Input
                placeholder="Filter industries…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-72 overflow-y-auto rounded-md border p-2">
                {shownIndustries.map((i) => (
                  <label key={i.name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                    <Checkbox
                      checked={industries.includes(i.name)}
                      onCheckedChange={() => toggle(industries, setIndustries, i.name)}
                    />
                    <span className="flex-1 text-sm">{i.name}</span>
                    {i.searches > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {nf.format(i.imported)} from {nf.format(i.searches)}
                      </span>
                    )}
                  </label>
                ))}
                {shownIndustries.length === 0 && (
                  <p className="text-muted-foreground p-2 text-sm">No industries match that filter.</p>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">States ({states.length} selected)</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setStates(allStatesSelected ? [] : (catalog.data?.states ?? []).map((s) => s.state))
                    }
                  >
                    {allStatesSelected ? 'Deselect' : 'Select'} all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStates([])}>Clear</Button>
                </div>
              </div>
              <div className="max-h-[22.5rem] overflow-y-auto rounded-md border p-2">
                {(catalog.data?.states ?? []).map((s) => (
                  <label key={s.state} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                    <Checkbox
                      checked={states.includes(s.state)}
                      onCheckedChange={() => toggle(states, setStates, s.state)}
                    />
                    <span className="flex-1 text-sm">{s.state}</span>
                    <span className="text-muted-foreground text-xs">{nf.format(s.cities)} cities · {s.timeZone}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Directories</label>
              <div className="flex gap-1.5">
                {SOURCE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.label}
                    type="button"
                    size="sm"
                    variant={sameSources(sources, opt.value) ? 'default' : 'outline'}
                    onClick={() => setSources(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Pages per search</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={maxPages}
                onChange={(e) => setMaxPages(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                className="w-24"
              />
            </div>
            <Button
              variant="outline"
              disabled={!canSubmit || preview.isPending}
              onClick={() => preview.mutate({ industries, states, sources, maxPages })}
            >
              {preview.isPending ? 'Checking…' : 'Check coverage'}
            </Button>
            <Button
              disabled={!canSubmit || create.isPending}
              onClick={() => {
                create.mutate(
                  { industries, states, sources, maxPages },
                  { onSuccess: () => { setIndustries([]); setStates([]); } },
                );
              }}
            >
              {create.isPending ? 'Queueing…' : 'Queue this work'}
            </Button>
          </div>

          {preview.data && (
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p>
                <strong>{nf.format(preview.data.totalPairs)}</strong> searches across{' '}
                {nf.format(preview.data.cities)} cities.{' '}
                <strong>{nf.format(preview.data.newPairs)}</strong> are new;{' '}
                {nf.format(preview.data.alreadyCovered)} are already queued or were read recently.
              </p>
              {preview.data.bySource.length > 1 && (
                /* Coverage is per directory, so a pair can be new on one and
                   covered on the other. One blended number describes neither. */
                <ul className="mt-2 space-y-0.5">
                  {preview.data.bySource.map((row) => (
                    <li key={row.source}>
                      <strong>{SOURCE_LABELS[row.source]}</strong>: {nf.format(row.newPairs)} new of{' '}
                      {nf.format(row.totalPairs)}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground mt-1">
                No completion date is shown on purpose: the daily lead target, not the queue size,
                decides how fast this drains.
              </p>
            </div>
          )}

          {(preview.error || create.error) && (
            <p className="text-destructive text-sm">{(preview.error ?? create.error)?.message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Active requests</CardTitle></CardHeader>
        <CardContent>
          {overview.data?.requests.length ? (
            <div className="space-y-3">
              {overview.data.requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <Badge variant={r.status === 'active' ? 'default' : 'outline'}>{r.status}</Badge>
                  <div className="flex-1 text-sm">
                    <div className="font-medium">Request #{r.id} · {r.createdBy}</div>
                    <div className="text-muted-foreground">
                      {nf.format(r.completedTasks)} of {nf.format(r.totalTasks)} searches ·{' '}
                      {nf.format(r.leadsImported)} leads delivered
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => update.mutate({ id: r.id, status: r.status === 'active' ? 'paused' : 'active' })}
                  >
                    {r.status === 'active' ? <><Pause className="mr-1 h-3 w-3" /> Pause</> : <><Play className="mr-1 h-3 w-3" /> Resume</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => cancel.mutate(r.id)}>
                    <X className="mr-1 h-3 w-3" /> Cancel
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Nothing queued right now.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <QueueProgress />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Failed searches
              </span>
              {!!overview.data?.failedTasks.length && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(overview.data!.failedTasks.map((t) => t.id))}
                >
                  {retry.isPending ? 'Requeueing…' : 'Requeue all'}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.data?.failedTasks.length ? (
              <div className="space-y-2 text-sm">
                {overview.data.failedTasks.map((t) => (
                  <div key={t.id} className="border-b pb-2 last:border-0">
                    <div className="font-medium">{t.industry} in {t.city}, {t.state}</div>
                    <div className="text-muted-foreground text-xs">
                      {t.attempts} attempts · {t.lastError ?? 'no detail'}
                    </div>
                    <Button variant="ghost" size="sm" className="mt-1 h-6 px-2 text-xs"
                      onClick={() => retry.mutate([t.id])}>
                      Requeue
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">None. Every search either completed or is still queued. A failed search stays uncovered until requeued.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <RunHistory />
    </div>
  );
}
