import { useQuery } from '@tanstack/react-query';

export interface AvailabilityRow {
  label: string;
  total: number;
}

export interface LeadAvailability {
  timeZone: string | null;
  /** Every available lead, regardless of the requested zone. */
  total: number;
  /** Available leads inside the requested zone, or all of them when unscoped. */
  scopedTotal: number;
  /** Counted in scopedTotal but absent from `industries`: no industry on record. */
  unspecified: number;
  byZone: AvailabilityRow[];
  industries: AvailabilityRow[];
  otherIndustries: { count: number; total: number } | null;
  emptyIndustries: number;
  generatedAt: string;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

/**
 * What is callable right now, by zone and industry.
 *
 * `enabled` exists because the calls page only asks after a lead request comes
 * back empty: counting 1.4M rows on every page load to answer a question nobody
 * asked would be wasteful, and the answer only matters at the moment an agent
 * is told there is nothing to call.
 */
export function useLeadAvailability(timezone?: string | null, enabled = true) {
  const scope = timezone || 'all';

  return useQuery({
    queryKey: ['lead-availability', scope],
    queryFn: () => json<LeadAvailability>(`/api/leads/availability?timezone=${encodeURIComponent(scope)}`),
    enabled,
    // Leads drain by roughly 4,000 a day across 16 agents, so a count a minute
    // old is still a true answer to "is there anything here".
    staleTime: 60 * 1000,
  });
}
