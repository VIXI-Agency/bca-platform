'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethod } from '@/lib/payroll/constants';
import { invalidatePayData } from './invalidate-pay-data';

export interface PayStatementRow {
  id: number | null;
  userId: number;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  payRate: number | null;
  otPayRate: number | null;
  regularPay: number;
  overtimePay: number;
  bonusTotal: number;
  grossPay: number;
  status: 'pending' | 'paid' | 'void';
  paymentMethod: string | null;
  paymentReference: string | null;
  paidDate: string | null;
}

export interface PayRunInfo {
  id: number | null;
  periodStart: string;
  periodEnd: string;
  /** False while the period is still running: it can't be approved yet. */
  periodEnded: boolean;
  status: 'approved' | 'paid' | 'void' | null;
  scheduledPayDate: string | null;
  notes: string;
}

export interface PayRunResponse {
  isLive: boolean;
  run: PayRunInfo;
  statements: PayStatementRow[];
}

export interface PaymentHistoryEntry {
  id: number;
  userId: number;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  bonusTotal: number;
  grossPay: number;
  status: 'pending' | 'paid' | 'void';
  paymentMethod: string | null;
  paymentReference: string | null;
  paidDate: string | null;
}

export interface PaymentHistoryFilters {
  userId?: number;
  from?: string;
  to?: string;
  status?: 'pending' | 'paid' | 'void';
  page?: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function usePayRun(week: string) {
  return useQuery<PayRunResponse>({
    queryKey: ['payroll-run', week],
    queryFn: () => fetchJson<PayRunResponse>(`/api/admin/payroll/runs?week=${week}`),
    enabled: !!week,
  });
}

export function useApprovePayRun() {
  const qc = useQueryClient();
  return useMutation<
    { success: boolean; runId: number },
    Error,
    { period: string; scheduledPayDate?: string; notes?: string }
  >({
    mutationFn: (payload) =>
      fetchJson('/api/admin/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => invalidatePayData(qc),
  });
}

export function useMarkStatementsPaid() {
  const qc = useQueryClient();
  return useMutation<
    { success: boolean; runFullyPaid: boolean },
    Error,
    {
      runId: number;
      week: string;
      statementIds: number[];
      paymentMethod: PaymentMethod;
      paymentReference?: string;
      paidDate: string;
    }
  >({
    mutationFn: ({ runId, statementIds, paymentMethod, paymentReference, paidDate }) =>
      fetchJson(`/api/admin/payroll/runs/${runId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statementIds, paymentMethod, paymentReference, paidDate }),
      }),
    onSuccess: () => invalidatePayData(qc),
  });
}

export function useVoidPayRun() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, { runId: number; week: string; reason: string }>({
    mutationFn: ({ runId, reason }) =>
      fetchJson(`/api/admin/payroll/runs/${runId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => invalidatePayData(qc),
  });
}

export function usePaymentHistory(filters: PaymentHistoryFilters) {
  const params = new URLSearchParams();
  if (filters.userId) params.set('userId', String(filters.userId));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(filters.page ?? 1));

  return useQuery<{ data: PaymentHistoryEntry[]; total: number; page: number; pageSize: number }>({
    queryKey: ['payroll-history', filters],
    queryFn: () => fetchJson(`/api/admin/payroll/history?${params}`),
  });
}

export interface PayrollEmployee {
  userId: number;
  name: string;
}

/** Employees with payroll history — not just currently-active staff, so a
 *  terminated employee's past statements stay filterable. Separate from
 *  useEmployeeList() in use-admin-time (Administrator-only, active staff
 *  only) so a role-2 manager granted admin_payroll can still use this
 *  filter even though Time Management itself is locked to Administrator. */
export function usePayrollEmployees() {
  return useQuery<PayrollEmployee[]>({
    queryKey: ['payroll-employees'],
    queryFn: async () => {
      const json = await fetchJson<{ data: PayrollEmployee[] }>('/api/admin/payroll/employees');
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
