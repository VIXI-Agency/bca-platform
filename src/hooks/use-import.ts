'use client';

import { useMutation } from '@tanstack/react-query';

/* -------------------------------------------------- */
/*  Types                                              */
/* -------------------------------------------------- */

export interface ImportRow {
  [key: string]: string;
}

export interface ColumnMapping {
  businessName: string;
  phone: string;
  address: string;
  location: string;
  industry: string;
  timezone: string;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: { row: number; field: string; message: string }[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  emailSent?: boolean;
}

export interface ValidatePayload {
  rows: ImportRow[];
  mapping: ColumnMapping;
}

export interface ImportPayload {
  rows: ImportRow[];
  mapping: ColumnMapping;
  originalFile?: {
    name: string;
    content: string;
    type?: string;
  };
}

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

function applyMapping(rows: ImportRow[], mapping: ColumnMapping): Record<string, string>[] {
  return rows.map((row) => ({
    businessName: row[mapping.businessName] ?? '',
    phone:        row[mapping.phone]         ?? '',
    address:      row[mapping.address]       ?? '',
    location:     row[mapping.location]      ?? '',
    industry:     row[mapping.industry]      ?? '',
    timeZone:     row[mapping.timezone]      ?? '',
  }));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

/* -------------------------------------------------- */
/*  Mutations                                          */
/* -------------------------------------------------- */

export function useValidateImport() {
  return useMutation<ValidationResult, Error, ValidatePayload>({
    mutationFn: ({ rows, mapping }) =>
      fetchJson('/api/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: applyMapping(rows, mapping) }),
      }),
  });
}

export function useImportLeads() {
  return useMutation<ImportResult, Error, ImportPayload>({
    mutationFn: ({ rows, mapping, originalFile }) =>
      fetchJson('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: applyMapping(rows, mapping), originalFile }),
      }),
  });
}
