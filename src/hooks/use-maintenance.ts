import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type MaintenanceStatus = 'overdue' | 'due-soon' | 'ok' | 'never';
export type ComputerStatus = 'active' | 'inactive' | 'retired';
export type MaintenanceType = 'preventive' | 'corrective' | 'emergency';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

export interface AssignedUser {
  id: number;
  name: string;
}

export interface Computer {
  id: number;
  computerName: string;
  remotePcId: string | null;
  ipAddress: string | null;
  operatingSystem: string | null;
  specs: string | null;
  notes: string | null;
  status: ComputerStatus;
  maintenanceIntervalMonths: number;
  createdAt: string;
  updatedAt: string;
  assignedUsers: AssignedUser[];
  lastPreventiveDate: string | null;
  nextDueDate: string;
  maintenanceStatus: MaintenanceStatus;
  openTicketCount: number;
}

export interface Printer {
  id: number;
  printerName: string;
  brandModel: string | null;
  ipAddress: string | null;
  location: string | null;
  foldersSharing: boolean;
  sharedFolders: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MyComputer {
  id: number;
  computerName: string;
  remotePcId: string | null;
  operatingSystem: string | null;
  specs: string | null;
  notes: string | null;
  status: ComputerStatus;
  maintenanceIntervalMonths: number;
  lastPreventiveDate: string | null;
  nextDueDate: string;
  maintenanceStatus: MaintenanceStatus;
  openTicketCount: number;
}

export interface MaintenanceLog {
  id: number;
  computerId: number;
  computerName: string;
  maintenanceType: MaintenanceType;
  performedDate: string;
  technicianId: number;
  technicianName: string;
  durationMinutes: number | null;
  toolsUsed: string[];
  issuesFound: string | null;
  actionsTaken: string | null;
  notes: string | null;
  relatedTicketId: number | null;
  relatedTicket: { id: number; subject: string } | null;
  createdAt: string;
}

export interface MaintenanceTicket {
  id: number;
  computerId: number;
  computerName: string;
  reportedByUserId: number;
  reportedByName: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  resolvedDate: string | null;
  resolutionNotes: string | null;
  assignedToUserId: number | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyTicket {
  id: number;
  computerName: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  resolvedDate: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface CreateComputerPayload {
  computerName: string;
  remotePcId?: string;
  ipAddress?: string;
  assignedUserIds?: number[];
  operatingSystem?: string;
  specs?: string;
  notes?: string;
  maintenanceIntervalMonths: number;
}

export interface UpdateComputerPayload {
  computerName?: string;
  remotePcId?: string;
  ipAddress?: string;
  assignedUserIds?: number[];
  operatingSystem?: string;
  specs?: string;
  notes?: string;
  maintenanceIntervalMonths?: number;
  status?: ComputerStatus;
}

export interface CreatePrinterPayload {
  printerName: string;
  brandModel?: string;
  ipAddress?: string;
  location?: string;
  foldersSharing: boolean;
  sharedFolders?: string;
  notes?: string;
}

export interface UpdatePrinterPayload {
  printerName?: string;
  brandModel?: string;
  ipAddress?: string;
  location?: string;
  foldersSharing?: boolean;
  sharedFolders?: string;
  notes?: string;
  status?: string;
}

export interface CreateLogPayload {
  computerId: number;
  maintenanceType: MaintenanceType;
  performedDate: string;
  durationMinutes?: number | null;
  toolsUsed?: string[];
  issuesFound?: string;
  actionsTaken?: string;
  notes?: string;
  relatedTicketId?: number | null;
}

export interface CreateTicketPayload {
  computerId: number;
  subject: string;
  description: string;
  priority: TicketPriority;
}

export interface UpdateTicketPayload {
  status?: TicketStatus;
  assignedToUserId?: number | null;
  resolutionNotes?: string;
  resolvedDate?: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function useMyComputers() {
  return useQuery<MyComputer[]>({
    queryKey: ['maintenance-my-computers'],
    queryFn: () => fetchJson('/api/maintenance/my-computer'),
    staleTime: 2 * 60 * 1000,
  });
}

export function useMyTickets(filters?: { status?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery<MyTicket[]>({
    queryKey: ['maintenance-my-tickets', filters],
    queryFn: () => fetchJson(`/api/maintenance/tickets${qs}`),
    staleTime: 60 * 1000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation<MyTicket, Error, CreateTicketPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/maintenance/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-my-tickets'] });
      qc.invalidateQueries({ queryKey: ['maintenance-my-computers'] });
    },
  });
}

export function useAdminComputers(filters?: {
  search?: string;
  status?: string;
  maintenanceStatus?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.maintenanceStatus) params.set('maintenanceStatus', filters.maintenanceStatus);
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery<Computer[]>({
    queryKey: ['maintenance-computers', filters],
    queryFn: () => fetchJson(`/api/admin/maintenance/computers${qs}`),
    staleTime: 60 * 1000,
  });
}

export function useCreateComputer() {
  const qc = useQueryClient();
  return useMutation<Computer, Error, CreateComputerPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/admin/maintenance/computers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-computers'] }),
  });
}

export function useUpdateComputer() {
  const qc = useQueryClient();
  return useMutation<Computer, Error, { id: number; data: UpdateComputerPayload }>({
    mutationFn: ({ id, data }) =>
      fetchJson(`/api/admin/maintenance/computers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-computers'] }),
  });
}

export function useRetireComputer() {
  const qc = useQueryClient();
  return useMutation<Computer, Error, number>({
    mutationFn: (id) =>
      fetchJson(`/api/admin/maintenance/computers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-computers'] }),
  });
}

export function useAdminLogs(filters?: {
  computerId?: number;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.computerId) params.set('computerId', String(filters.computerId));
  if (filters?.type) params.set('type', filters.type);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery<PaginatedResponse<MaintenanceLog>>({
    queryKey: ['maintenance-logs', filters],
    queryFn: () => fetchJson(`/api/admin/maintenance/logs${qs}`),
    staleTime: 60 * 1000,
  });
}

export function useCreateLog() {
  const qc = useQueryClient();
  return useMutation<MaintenanceLog, Error, CreateLogPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/admin/maintenance/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-logs'] });
      qc.invalidateQueries({ queryKey: ['maintenance-computers'] });
      qc.invalidateQueries({ queryKey: ['maintenance-admin-tickets'] });
    },
  });
}

export function useAdminTickets(filters?: {
  status?: string;
  priority?: string;
  computerId?: number;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  if (filters?.computerId) params.set('computerId', String(filters.computerId));
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery<PaginatedResponse<MaintenanceTicket>>({
    queryKey: ['maintenance-admin-tickets', filters],
    queryFn: () => fetchJson(`/api/admin/maintenance/tickets${qs}`),
    staleTime: 60 * 1000,
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation<MaintenanceTicket, Error, { id: number; data: UpdateTicketPayload }>({
    mutationFn: ({ id, data }) =>
      fetchJson(`/api/admin/maintenance/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-admin-tickets'] });
    },
  });
}

export function useAdminPrinters(filters?: { search?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery<Printer[]>({
    queryKey: ['maintenance-printers', filters],
    queryFn: () => fetchJson(`/api/admin/maintenance/printers${qs}`),
    staleTime: 60 * 1000,
  });
}

export function useCreatePrinter() {
  const qc = useQueryClient();
  return useMutation<Printer, Error, CreatePrinterPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/admin/maintenance/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-printers'] }),
  });
}

export function useUpdatePrinter() {
  const qc = useQueryClient();
  return useMutation<Printer, Error, { id: number; data: UpdatePrinterPayload }>({
    mutationFn: ({ id, data }) =>
      fetchJson(`/api/admin/maintenance/printers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-printers'] }),
  });
}

export function useRetirePrinter() {
  const qc = useQueryClient();
  return useMutation<Printer, Error, number>({
    mutationFn: (id) =>
      fetchJson(`/api/admin/maintenance/printers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-printers'] }),
  });
}
