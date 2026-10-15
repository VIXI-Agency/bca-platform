'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BONUS_FIELDS,
  type BonusFieldKey,
  type DatedBonusCategory,
  type PeriodBonusField,
} from '@/lib/payroll/constants';
import { invalidatePayData } from './invalidate-pay-data';

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
  disconnectedMinutes?: number;
  modifiedFields?: string[];
  isModifiedByAdmin?: boolean;
}

export interface WeekTotals {
  totalHours: number;
  overtime: number;
  firstBreakExcess: number;
  secondBreakExcess: number;
  disconnectedMinutes: number;
}

export interface TimesheetResponse {
  data: DayLog[];
  audits: Audit[];
  employee: { idUser: number; name: string | null; lastname: string | null; isPartTime: boolean | null };
  weekStart: string;
  weekEnd: string;
  weekTotals: WeekTotals;
  /** 'approved' or 'paid' means the period is locked for edits. */
  payRunStatus: 'approved' | 'paid' | 'void' | null;
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
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
}

export interface DisconnectionsResponse {
  data: DisconnectionEntry[];
  counts: Record<DisconnectionType, number>;
}

// Defined once in @/lib/payroll/constants (shared with the API and Payroll);
// re-exported so existing imports from this hook keep working.
export { BONUS_FIELDS, type BonusFieldKey };

/** The bonuses typed as one amount per period (Wheel Spins / CCF Spiffs are dated entries). */
export type BonusResponse = Record<PeriodBonusField, number | null>;

/** One dated bonus (Wheel Spins, CCF Spiffs). */
export interface BonusEntry {
  id: number;
  category: DatedBonusCategory;
  date: string;
  amount: number;
}

/** A disconnection's span in an audit entry (PST wall-clock TIME values). */
export interface DisconnectionSpan {
  start: string;
  end: string | null;
  type: string | null;
}

export interface Audit {
  /** Time edits and disconnection changes have separate id sequences. */
  kind?: 'time' | 'disconnection';
  id: number;
  userId: number;
  employeeName: string;
  date: string;
  /** A time field ('clockIn', …) or 'disconnection_add' | _edit | _remove. */
  field: string;
  oldValue: string | null;
  newValue: string;
  /** Disconnection changes only: the workday and the span before/after. */
  disconnection?: { day: string; before: DisconnectionSpan | null; after: DisconnectionSpan | null };
  modifiedBy: string;
  modifiedAt: string;
  reason: string;
}

export interface AddDisconnectionPayload {
  userId: number;
  date: string;
  start: string;
  /** null = never reconnected that day: counts until clock-out. */
  end: string | null;
  type: DisconnectionType;
  reason: string;
}

export interface EditDisconnectionPayload {
  id: number;
  start: string;
  end: string | null;
  type: DisconnectionType;
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
  paidHours: number | null;
  disconnectedMinutes: number;
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

/** Every employee's manual time edits in a pay period (Audit Log → All Employees). */
export function usePeriodAudits(week: string, enabled: boolean) {
  return useQuery<Audit[]>({
    queryKey: ['admin-audits', week],
    queryFn: async () => {
      const json = await fetchJson<{ audits: Audit[] }>(`/api/admin/time/audits?week=${week}`);
      return json.audits;
    },
    enabled: enabled && !!week,
  });
}

/** The pay period's dated bonuses (Wheel Spins, CCF Spiffs) for one employee. */
export function useBonusEntries(userId: number, week: string) {
  return useQuery<BonusEntry[]>({
    queryKey: ['admin-bonus-entries', userId, week],
    queryFn: async () => {
      const json = await fetchJson<{ entries: BonusEntry[] }>(`/api/admin/time/${userId}/bonus-entries?week=${week}`);
      return json.entries;
    },
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

export function useBonus(userId: number, week: string) {
  return useQuery<BonusResponse>({
    queryKey: ['admin-bonus', userId, week],
    queryFn: () =>
      fetchJson<BonusResponse>(`/api/admin/time/${userId}/bonus?week=${week}`),
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
    onSuccess: () => invalidatePayData(qc),
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
      // Disconnected time changes paid hours, so every view of hours is stale.
      invalidatePayData(qc);
    },
  });
}

/** Refreshes everything a disconnection change affects (pay, lists, live status). */
function invalidateDisconnections(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin-time-statuses'] });
  invalidatePayData(qc);
}

/** Records a disconnection after the fact (a day already worked). */
export function useAddDisconnection() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, AddDisconnectionPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/admin/time/disconnections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => invalidateDisconnections(qc),
  });
}

/** Fixes the times or type of a disconnection entered wrong. */
export function useEditDisconnection() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, EditDisconnectionPayload>({
    mutationFn: ({ id, ...body }) =>
      fetchJson(`/api/admin/time/disconnections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateDisconnections(qc),
  });
}

/** Removes a disconnection entered by mistake (it stops counting against pay). */
export function useRemoveDisconnection() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: number; reason: string }>({
    mutationFn: ({ id, reason }) =>
      fetchJson(`/api/admin/time/disconnections/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => invalidateDisconnections(qc),
  });
}

/** Adds one dated bonus; the server enforces each category's caps. */
export function useAddBonusEntry() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { userId: number; category: DatedBonusCategory; date: string; amount: number }>({
    mutationFn: ({ userId, ...body }) =>
      fetchJson(`/api/admin/time/${userId}/bonus-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidatePayData(qc),
  });
}

/** Removes one dated bonus. */
export function useRemoveBonusEntry() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: number }>({
    mutationFn: ({ id }) => fetchJson(`/api/admin/time/bonus-entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidatePayData(qc),
  });
}

/** Minimal pay-rate update: PUTs only payRate/otPayRate, not the full user
 *  edit form — lets the Payment Report set a rate inline without needing
 *  the rest of the user's profile fields on hand. */
export function useUpdatePayRate() {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    Error,
    // null clears a rate; undefined (dropped by JSON) would leave it unchanged.
    { userId: number; payRate: number | null; otPayRate: number | null }
  >({
    mutationFn: ({ userId, ...rest }) =>
      fetchJson(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rest),
      }),
    onSuccess: () => invalidatePayData(qc),
  });
}

/** Upserts an employee's bonus/incentive categories for one pay period — each
 *  a manual dollar amount the admin types in (not computed from any formula)
 *  that gets added into the Payment Report's total and shown on the printed
 *  PDF, one line per category that's actually set. */
export function useSaveBonus() {
  const qc = useQueryClient();
  return useMutation<
    BonusResponse,
    Error,
    { userId: number; week: string } & Partial<Record<PeriodBonusField, number | null>>
  >({
    mutationFn: ({ userId, week, ...fields }) =>
      fetchJson(`/api/admin/time/${userId}/bonus`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: week, ...fields }),
      }),
    onSuccess: () => invalidatePayData(qc),
  });
}
