'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/* -------------------------------------------------- */
/*  Types                                              */
/* -------------------------------------------------- */

export interface EmployeeStatus {
  userId: number;
  name: string;
  role: number;
  isPartTime: boolean;
  status:
    | 'not_clocked_in'
    | 'working'
    | 'on_break'
    | 'at_lunch'
    | 'clocked_out';
  clockIn?: string;
  firstBreakOut?: string;
  firstBreakIn?: string;
  lunchOut?: string;
  lunchIn?: string;
  secondBreakOut?: string;
  secondBreakIn?: string;
  clockOut?: string;
  currentBreakStart?: string;
  breakExceeded: boolean;
  isDisconnected: boolean;
}

export interface Employee {
  userId: number;
  name: string;
  email: string;
  role: number | null;
  isPartTime: boolean;
  payRate: number | null;
  otPayRate: number | null;
}

export interface DayLog {
  date: string;
  clockIn?: string;
  firstBreakOut?: string;
  firstBreakIn?: string;
  lunchOut?: string;
  lunchIn?: string;
  secondBreakOut?: string;
  secondBreakIn?: string;
  clockOut?: string;
  totalHours?: number;
  overtime?: number;
  modifiedFields?: string[];
  isModifiedByAdmin?: boolean;
}

export interface WeekTotals {
  totalHours: number;
  overtime: number;
  firstBreakExcess: number;
  secondBreakExcess: number;
}

export interface TimesheetResponse {
  data: DayLog[];
  audits: Audit[];
  employee: { idUser: number; name: string | null; lastname: string | null; isPartTime: boolean | null };
  weekStart: string;
  weekEnd: string;
  weekTotals: WeekTotals;
}

export type DisconnectionType =
  | 'absence'
  | 'early_leave'
  | 'power_outage'
  | 'internet_outage'
  | 'other';

export interface DisconnectionEntry {
  id: number;
  date: string;
  type: DisconnectionType;
  reason: string;
  disconnectedBy: string;
}

export interface DisconnectionsResponse {
  data: DisconnectionEntry[];
  counts: Record<DisconnectionType, number>;
}

export interface Audit {
  id: number;
  userId: number;
  employeeName: string;
  date: string;
  field: string;
  oldValue: string | null;
  newValue: string;
  modifiedBy: string;
  modifiedAt: string;
  reason: string;
}

export interface EditTimePayload {
  userId: number;
  date: string;
  field: string;
  value: string;
  reason: string;
}

export interface DisconnectPayload {
  userId: number;
  action: 'disconnect' | 'reconnect';
  type?: DisconnectionType;
  reason?: string;
}

export interface TimeHistoryEntry {
  timeLogId: number;
  userId: number;
  employeeName: string;
  date: string;
  clockIn: string | null;
  firstBreakOut: string | null;
  firstBreakIn: string | null;
  lunchOut: string | null;
  lunchIn: string | null;
  secondBreakOut: string | null;
  secondBreakIn: string | null;
  clockOut: string | null;
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

export function useEmployeeStatuses() {
  return useQuery<EmployeeStatus[]>({
    queryKey: ['admin-time-statuses'],
    queryFn: async () => {
      const json = await fetchJson<{ data: EmployeeStatus[] }>(
        '/api/admin/time'
      );
      return json.data;
    },
    refetchInterval: 30000,
  });
}

export function useEmployeeList() {
  return useQuery<Employee[]>({
    queryKey: ['admin-time-employees'],
    queryFn: async () => {
      const json = await fetchJson<{ data: Employee[] }>(
        '/api/admin/time/employees'
      );
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useEmployeeTimesheet(userId: number, week: string) {
  return useQuery<TimesheetResponse>({
    queryKey: ['admin-timesheet', userId, week],
    queryFn: () =>
      fetchJson<TimesheetResponse>(`/api/admin/time/${userId}?week=${week}`),
    enabled: !!userId && !!week,
  });
}

export function useDisconnections(userId: number, week: string) {
  return useQuery<DisconnectionsResponse>({
    queryKey: ['admin-disconnections', userId, week],
    queryFn: () =>
      fetchJson<DisconnectionsResponse>(
        `/api/admin/time/${userId}/disconnections?week=${week}`
      ),
    enabled: !!userId && !!week,
  });
}

/* -------------------------------------------------- */
/*  Mutations                                          */
/* -------------------------------------------------- */

export function useEditTime() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, EditTimePayload>({
    mutationFn: (payload) =>
      fetchJson('/api/admin/time/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['admin-timesheet', variables.userId],
      });
      qc.invalidateQueries({ queryKey: ['admin-audit-log'] });
    },
  });
}

export function useTimeHistory(week: string, userId?: number) {
  const params = new URLSearchParams({ week });
  if (userId) params.set('userId', String(userId));
  return useQuery<TimeHistoryEntry[]>({
    queryKey: ['admin-time-history', week, userId],
    queryFn: () => fetchJson(`/api/admin/time/history?${params}`),
    enabled: !!week,
    staleTime: 30_000,
  });
}

export function useDisconnectEmployee() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, DisconnectPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/admin/time/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-time-statuses'] });
    },
  });
}
