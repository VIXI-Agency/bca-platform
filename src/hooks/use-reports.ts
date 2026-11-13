'use client';

import { useQuery, useMutation } from '@tanstack/react-query';

export interface ReportFilters {
  repId?: string;
  startDate?: string;
  endDate?: string;
  disposition?: string;
  closerId?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportRow {
  idCall: number;
  callDate: string;
  repName: string;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  disposition: string;
  dmakerName: string | null;
  dmakerPhone: string | null;
  dmakerEmail: string | null;
  comments: string | null;
  debtAmount: string | null;
  debtorName: string | null;
  agreementSent: string | null;
  callBack: string | null;
  closerName: string | null;
  idDisposition: number;
  idCloser: number | null;
}

export interface ReportsSummary {
  totalCalls: number;
  avgPerDay: number;
  topRep: { name: string; count: number } | null;
  topDisposition: { name: string; count: number } | null;
}

export interface ReportsResponse {
  data: ReportRow[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function buildQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.repId && filters.repId !== 'all') params.set('repId', filters.repId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.disposition && filters.disposition !== 'all') params.set('disposition', filters.disposition);
  if (filters.closerId && filters.closerId !== 'all') params.set('closerId', filters.closerId);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useReports(filters: ReportFilters) {
  return useQuery<ReportsResponse>({
    queryKey: ['reports', filters],
    queryFn: () => fetchJson(`/api/reports${buildQueryString(filters)}`),
  });
}

export function useReportsSummary(filters: ReportFilters) {
  return useQuery<ReportsSummary>({
    queryKey: ['reports-summary', filters],
    queryFn: () =>
      fetchJson(`/api/reports/summary${buildQueryString(filters)}`),
  });
}

export function useResendEmail() {
  return useMutation<{ message: string; sentTo: string }, Error, number>({
    mutationFn: async (idCall) => {
      const res = await fetch('/api/calls/resend-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCall }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to send email');
      }
      return res.json();
    },
  });
}

export function useExportCSV() {
  return useMutation<void, Error, ReportFilters>({
    mutationFn: async (filters) => {
      const params = new URLSearchParams();
      if (filters.repId && filters.repId !== 'all') params.set('repId', filters.repId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.disposition && filters.disposition !== 'all') params.set('disposition', filters.disposition);
      if (filters.closerId && filters.closerId !== 'all') params.set('closerId', filters.closerId);
      params.set('format', 'csv');

      const res = await fetch(`/api/reports?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Export failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `call-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
  });
}
