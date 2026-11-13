import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface ClientBusiness {
  idBusiness: number;
  businessName: string;
  phone: string;
  address: string;
  location: string;
  industry: string;
  timezone: string;
  idStatus: number;
}

export interface PaginatedResponse {
  data: ClientBusiness[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function useClients(search: string, page: number, pageSize: number) {
  const params = new URLSearchParams({
    status: 'existing',
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) params.set('search', search);

  return useQuery<PaginatedResponse>({
    queryKey: ['clients-existing', search, page, pageSize],
    queryFn: () => fetchJson(`/api/businesses?${params.toString()}`),
    staleTime: 30_000,
  });
}

export function useAvailableBusinesses(search: string, page: number, pageSize: number) {
  const params = new URLSearchParams({
    status: 'available',
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) params.set('search', search);

  return useQuery<PaginatedResponse>({
    queryKey: ['clients-available', search, page, pageSize],
    queryFn: () => fetchJson(`/api/businesses?${params.toString()}`),
    staleTime: 30_000,
  });
}

export function useUpdateBusinessStatus() {
  const qc = useQueryClient();
  return useMutation<
    { success: boolean },
    Error,
    { idBusiness: number; idStatus: number }
  >({
    mutationFn: ({ idBusiness, idStatus }) =>
      fetchJson(`/api/businesses/${idBusiness}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: idStatus }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients-existing'] });
      qc.invalidateQueries({ queryKey: ['clients-available'] });
    },
  });
}
