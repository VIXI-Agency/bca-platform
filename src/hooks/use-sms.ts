import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export interface Conversation {
  phone: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

export interface SmsMessage {
  id: number;
  phone: string;
  body: string;
  direction: 'inbound' | 'outbound';
  createdAt: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | null;
  mediaType: string | null;
  mediaName: string | null;
}

export interface Contact {
  id: number;
  phoneNumber: string;
  name: string;
}

export interface SmsTemplate {
  id: number;
  title: string;
  body: string;
  sortOrder: number;
}

export interface SendSmsPayload {
  phone: string;
  body: string;
  mediaData?: string;
  mediaType?: string;
  mediaName?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ['sms-conversations'],
    queryFn: async () => {
      // Trigger inbox export so new inbound SMS fire webhooks and get saved to DB
      fetch('/api/sms/sync', { method: 'POST' }).catch(() => null);
      return fetchJson('/api/sms');
    },
    refetchInterval: 15_000,
  });
}

export function useMessages(phone: string | null) {
  const qc = useQueryClient();
  // Strip non-digits for the URL (IIS blocks %2B in path segments)
  const urlPhone = phone ? phone.replace(/\D/g, '') : null;

  // Mark messages as read when conversation is opened
  useEffect(() => {
    if (!phone) return;
    fetch('/api/sms/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    }).then(() => {
      qc.invalidateQueries({ queryKey: ['sms-conversations'] });
      qc.invalidateQueries({ queryKey: ['sms-unread-count'] });
    }).catch(() => null);
  }, [phone, qc]);

  return useQuery<SmsMessage[]>({
    queryKey: ['sms-messages', phone],
    queryFn: () => fetchJson(`/api/sms/${urlPhone}`),
    enabled: !!urlPhone,
    refetchInterval: 10_000,
  });
}

export function useMessageMedia(messageId: number | null) {
  return useQuery<{ data: string; type: string; name: string }>({
    queryKey: ['sms-media', messageId],
    queryFn: () => fetchJson(`/api/sms/media/${messageId}`),
    enabled: !!messageId,
    staleTime: 5 * 60 * 1000, // cache 5 min — base64 data doesn't change
  });
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, SendSmsPayload>({
    mutationFn: (payload) =>
      fetchJson('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: payload.phone,
          messageBody: payload.body,
          mediaData: payload.mediaData,
          mediaType: payload.mediaType,
          mediaName: payload.mediaName,
        }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['sms-conversations'] });
      qc.invalidateQueries({ queryKey: ['sms-messages', variables.phone] });
    },
  });
}

export function useContacts() {
  return useQuery<Contact[]>({
    queryKey: ['sms-contacts'],
    queryFn: () => fetchJson('/api/sms/contacts'),
    staleTime: 2 * 60 * 1000,
  });
}

export function useUpsertContact() {
  const qc = useQueryClient();
  return useMutation<Contact, Error, { phone: string; name: string }>({
    mutationFn: (payload) =>
      fetchJson('/api/sms/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-contacts'] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (phone) =>
      fetchJson('/api/sms/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-contacts'] }),
  });
}

export function useTemplates() {
  return useQuery<SmsTemplate[]>({
    queryKey: ['sms-templates'],
    queryFn: () => fetchJson('/api/sms/templates'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation<SmsTemplate, Error, { title: string; body: string }>({
    mutationFn: (payload) =>
      fetchJson('/api/sms/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, number>({
    mutationFn: (id) => fetchJson(`/api/sms/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-templates'] }),
  });
}
