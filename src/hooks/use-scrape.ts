import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface IndustryOption {
  name: string;
  searches: number;
  imported: number;
}

export interface StateOption {
  state: string;
  timeZone: string;
  cities: number;
}

export interface ScrapeRequestRow {
  id: number;
  createdBy: string;
  createdAt: string;
  status: string;
  maxPages: number;
  totalTasks: number;
  completedTasks: number;
  leadsImported: number;
}

export interface ScrapeRunRow {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  finishReason: string | null;
  tasksDone: number;
  leadsFound: number;
  leadsImported: number;
  duplicates: number;
  blacklisted: number;
  invalid: number;
}

export interface FailedTaskRow {
  id: number;
  industry: string;
  city: string;
  state: string;
  attempts: number;
  lastError: string | null;
}

export interface Preview {
  totalPairs: number;
  newPairs: number;
  alreadyCovered: number;
  cities: number;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function useScrapeCatalog() {
  return useQuery({
    queryKey: ['scrape', 'catalog'],
    queryFn: () => json<{ industries: IndustryOption[]; states: StateOption[] }>('/api/scrape/catalog'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useScrapeOverview() {
  return useQuery({
    queryKey: ['scrape', 'overview'],
    queryFn: () =>
      json<{ requests: ScrapeRequestRow[]; runs: ScrapeRunRow[]; failedTasks: FailedTaskRow[] }>(
        '/api/scrape/requests',
      ),
    refetchInterval: 30_000,
  });
}

type CreateInput = { industries: string[]; states: string[]; maxPages: number; preview?: boolean };

function post(input: CreateInput) {
  return json<Preview & { id?: number; queued?: number }>('/api/scrape/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface IndustryYield {
  industry: string;
  searches: number;
  found: number;
  imported: number;
}

export interface RunHistory {
  runs: ScrapeRunRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: {
    runs: number;
    searches: number;
    found: number;
    imported: number;
    duplicates: number;
    blacklisted: number;
    invalid: number;
    duplicateRate: number;
    importedPerRun: number;
    since: string | null;
  };
  queue: {
    pending: number;
    done: number;
    failed: number;
    leased: number;
    industriesRemaining: number;
    nextIndustry: string | null;
    searchesPerRun: number;
    runsRemaining: number | null;
    daysRemaining: number | null;
  };
  worstIndustries: IndustryYield[];
}

export interface RunDetail {
  run: ScrapeRunRow;
  industries: IndustryYield[];
  cities: { city: string; state: string; imported: number }[];
  zones: { timeZone: string; searches: number; imported: number }[];
  failures: FailedTaskRow[];
}

export function useRunHistory(page: number, outcome: string) {
  return useQuery({
    queryKey: ['scrape', 'runs', page, outcome],
    queryFn: () => json<RunHistory>(`/api/scrape/runs?page=${page}&outcome=${outcome}`),
    // A run in progress moves its counters while the page is open.
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
}

/** Fetched only once a row is expanded — one query per run the admin opens. */
export function useRunDetail(runId: number | null) {
  return useQuery({
    queryKey: ['scrape', 'run', runId],
    queryFn: () => json<RunDetail>(`/api/scrape/runs/${runId}`),
    enabled: runId !== null,
  });
}

export function usePreviewRequest() {
  return useMutation({ mutationFn: (input: CreateInput) => post({ ...input, preview: true }) });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInput) => post({ ...input, preview: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape'] }),
  });
}

export function useUpdateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'paused' }) =>
      json(`/api/scrape/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape'] }),
  });
}

export function useCancelRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => json(`/api/scrape/requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape'] }),
  });
}

export function useRetryTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskIds: number[]) =>
      json<{ requeued: number }>('/api/scrape/tasks/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape'] }),
  });
}
