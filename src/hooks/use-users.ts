'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/* -------------------------------------------------- */
/*  Types                                              */
/* -------------------------------------------------- */

export interface User {
  userId: number;
  name: string;
  lastname: string;
  email: string;
  role: number;
  sendEmail: boolean;
  isActive: boolean;
  isPartTime: boolean;
  smsAccess: boolean;
  timezone: string;
  city: string;
  state: string;
  country: string;
}

export interface CreateUserPayload {
  name: string;
  lastname: string;
  email: string;
  password: string;
  role: number;
  timezone: string;
  city: string;
  state: string;
  country: string;
  isPartTime: boolean;
  sendEmail: boolean;
}

export interface UpdateUserPayload {
  userId: number;
  name: string;
  lastname: string;
  email: string;
  password?: string;
  role: number;
  timezone: string;
  city: string;
  state: string;
  country: string;
  isPartTime: boolean;
  smsAccess: boolean;
  sendEmail: boolean;
}

export interface ScheduleDay {
  day: string;
  startTime: string;
  endTime: string;
}

export interface UserSchedule {
  userId: number;
  schedule: ScheduleDay[];
}

export interface UpdateSchedulePayload {
  userId: number;
  schedule: ScheduleDay[];
}

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

const STATUS_FALLBACKS: Partial<Record<number, string>> = {
  409: 'Email already in use',
  403: 'You do not have permission to perform this action',
  401: 'You must be signed in',
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = STATUS_FALLBACKS[res.status] ?? `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const fieldErrors = body?.details?.fieldErrors as Record<string, string[]> | undefined;
      const detail = fieldErrors
        ? Object.values(fieldErrors).flat().filter(Boolean).join('. ')
        : undefined;
      if (detail) message = detail;
      else if (body?.error) message = body.error;
      else if (body?.message) message = body.message;
    } catch {
      // non-JSON body — keep the status-based fallback
    }
    throw new Error(message);
  }
  return res.json();
}

/* -------------------------------------------------- */
/*  Queries                                            */
/* -------------------------------------------------- */

export function useUsers(search?: string, status?: string) {
  return useQuery<User[]>({
    queryKey: ['users', search, status],
    queryFn: async () => {
      const qp = new URLSearchParams();
      if (search) qp.set('search', search);
      if (status) qp.set('status', status);
      const qs = qp.toString();
      const json = await fetchJson<{ data: User[] } | User[]>(
        `/api/users${qs ? `?${qs}` : ''}`
      );
      return Array.isArray(json) ? json : json.data;
    },
  });
}

export function useUser(id: number) {
  return useQuery<User>({
    queryKey: ['user', id],
    queryFn: () => fetchJson(`/api/users/${id}`),
    enabled: !!id,
  });
}

export function useUserSchedule(id: number) {
  return useQuery<UserSchedule>({
    queryKey: ['user-schedule', id],
    queryFn: () => fetchJson(`/api/users/${id}/schedule`),
    enabled: !!id,
  });
}

/* -------------------------------------------------- */
/*  Mutations                                          */
/* -------------------------------------------------- */

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, CreateUserPayload>({
    mutationFn: ({ role, ...rest }) =>
      fetchJson('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, roleId: role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, UpdateUserPayload>({
    mutationFn: ({ userId, role, ...rest }) =>
      fetchJson(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, roleId: role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, number>({
    mutationFn: (userId) =>
      fetchJson(`/api/users/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, number>({
    mutationFn: (userId) =>
      fetchJson(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true, roleId: 3 }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();

  const DAY_TO_NUMBER: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };

  return useMutation<{ success: boolean }, Error, UpdateSchedulePayload>({
    mutationFn: ({ userId, schedule }) =>
      fetchJson(`/api/users/${userId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule: schedule.map((s) => ({
            dayOfWeek: DAY_TO_NUMBER[s.day] ?? 0,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
        }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['user-schedule', variables.userId],
      });
    },
  });
}
