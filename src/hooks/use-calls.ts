import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { Disposition, Rebuttal } from '@/types';

/* -------------------------------------------------- */
/*  Types                                              */
/* -------------------------------------------------- */

export interface CloserUser {
  userId: number;
  name: string;
}

export interface IndustryOption {
  name: string;
  count: number;
}

export interface FiltersData {
  industries: IndustryOption[];
  timezones: string[];
}

export interface LeadBusiness {
  idBusiness: number;
  businessName: string;
  phone: string;
  address: string;
  location: string;
  industry: string;
  timezone: string;
  idStatus: number;
}

export interface LogCallPayload {
  idBusiness: number;
  idDisposition: number;
  comments?: string;
  idCloser?: number;
  callBack?: string;
  dmakerName?: string;
  dmakerEmail?: string;
  dmakerPhone?: string;
  debtAmount?: number;
  debtorName?: string;
  agreementSent?: boolean;
}

export interface NextLeadPayload {
  timezone: string;
  industry?: string;
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

export function useDispositions() {
  return useQuery<Disposition[]>({
    queryKey: ['dispositions'],
    queryFn: () => fetchJson('/api/calls/dispositions'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFilters(timezone?: string) {
  return useQuery<FiltersData>({
    queryKey: ['call-filters', timezone ?? ''],
    queryFn: () =>
      fetchJson(`/api/calls/filters${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ''}`),
    staleTime: 30 * 60 * 1000, // 30 min — dropdown values rarely change
    placeholderData: keepPreviousData, // keep timezones visible while industries refetch on tz change
  });
}

export function useClosers() {
  return useQuery<CloserUser[]>({
    queryKey: ['closers'],
    queryFn: () => fetchJson('/api/calls/closers'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRebuttals() {
  return useQuery<Rebuttal[]>({
    queryKey: ['rebuttals'],
    queryFn: () => fetchJson('/api/rebuttals'),
    staleTime: 5 * 60 * 1000,
  });
}

/* -------------------------------------------------- */
/*  Mutations                                          */
/* -------------------------------------------------- */

export function useNextLead() {
  return useMutation<LeadBusiness, Error, NextLeadPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/calls/next-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
  });
}

export function useLogCall() {
  const qc = useQueryClient();
  return useMutation<{ idCall: number }, Error, LogCallPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/calls/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-history'] });
    },
  });
}

export function useRevertBusiness() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, { idBusiness: number; idCall?: number }>({
    mutationFn: (payload) =>
      fetchJson('/api/calls/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-history'] });
    },
  });
}
