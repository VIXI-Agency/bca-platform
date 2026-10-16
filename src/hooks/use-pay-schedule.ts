'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PaySchedule } from '@/lib/payroll/pay-schedule';
import { invalidatePayData } from './invalidate-pay-data';

export interface PayScheduleResponse {
  /** The pay week the user is on today. */
  current: PaySchedule;
  /** Label of the pay period they are in today, e.g. "Oct 16 - Oct 22, 2026". */
  currentPeriod: string;
  /** Every change, oldest first; future ones can still be cancelled. */
  changes: { schedule: PaySchedule; effectiveFrom: string }[];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

const key = (userId: number) => ['pay-schedule', userId];

/** A user's pay week (remote Fri–Thu or In House Mon–Fri) and its changes. */
export function usePaySchedule(userId: number | null) {
  return useQuery<PayScheduleResponse>({
    queryKey: key(userId ?? 0),
    queryFn: () => fetchJson<PayScheduleResponse>(`/api/users/${userId}/pay-schedule`),
    enabled: !!userId,
  });
}

/** Moves a user to `schedule` from `effectiveFrom` on. Every pay view is refreshed. */
export function useSetPaySchedule() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { userId: number; schedule: PaySchedule; effectiveFrom: string }>({
    mutationFn: ({ userId, ...body }) =>
      fetchJson(`/api/users/${userId}/pay-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: key(userId) });
      invalidatePayData(qc);
    },
  });
}

/** Cancels the change on `effectiveFrom`. */
export function useCancelPaySchedule() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { userId: number; effectiveFrom: string }>({
    mutationFn: ({ userId, effectiveFrom }) =>
      fetchJson(`/api/users/${userId}/pay-schedule?effectiveFrom=${effectiveFrom}`, { method: 'DELETE' }),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: key(userId) });
      invalidatePayData(qc);
    },
  });
}
