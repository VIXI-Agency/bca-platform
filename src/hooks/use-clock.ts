import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TimeLogEntry, ClockAction, ClockStatus } from '@/types';

/* -------------------------------------------------- */
/*  Types                                              */
/* -------------------------------------------------- */

export interface ClockStatusResponse {
  data: TimeLogEntry | null;
  nextAction: ClockAction | null;
  status: ClockStatus;
  /** True when the signed-in employee is flagged part-time (may skip breaks). */
  isPartTime?: boolean;
}

export interface ClockActionResponse {
  data: TimeLogEntry;
  nextAction: ClockAction | null;
  status: ClockStatus;
}

export interface DayLog extends TimeLogEntry {
  dayOfWeek: string;
  isModifiedByAdmin?: boolean;
}

export interface WeeklyTimesheetResponse {
  data: DayLog[];
  weekTotal: number;
}

export interface AvailableWeek {
  date: string;
  label: string;
}

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

/* -------------------------------------------------- */
/*  Queries                                            */
/* -------------------------------------------------- */

export function useClockStatus() {
  return useQuery<ClockStatusResponse>({
    queryKey: ['clock-status'],
    queryFn: () => fetchJson('/api/clock'),
    refetchInterval: 30_000,
  });
}

export function useWeeklyTimesheet(week: string) {
  return useQuery<WeeklyTimesheetResponse>({
    queryKey: ['clock-week', week],
    queryFn: () => fetchJson(`/api/clock/week?week=${week}`),
    enabled: !!week,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAvailableWeeks() {
  return useQuery<AvailableWeek[]>({
    queryKey: ['clock-weeks'],
    queryFn: async () => {
      const res = await fetchJson<{ data: AvailableWeek[] }>('/api/clock/weeks');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* -------------------------------------------------- */
/*  Mutations                                          */
/* -------------------------------------------------- */

export function useClockAction() {
  const qc = useQueryClient();
  return useMutation<ClockActionResponse, Error, { action: ClockAction }>({
    mutationFn: (payload) =>
      fetchJson('/api/clock/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-status'] });
      qc.invalidateQueries({ queryKey: ['clock-week'] });
    },
  });
}

export function useSkipBreak() {
  const qc = useQueryClient();
  return useMutation<ClockActionResponse, Error, { breakType: string }>({
    mutationFn: (payload) =>
      fetchJson('/api/clock/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-status'] });
      qc.invalidateQueries({ queryKey: ['clock-week'] });
    },
  });
}
