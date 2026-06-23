import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/* -------------------------------------------------- */
/*  Types                                              */
/* -------------------------------------------------- */

export interface Video {
  id: number;
  title: string;
  url: string;
  watched: boolean;
  watchedAt: string | null;
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

export function useVideos() {
  return useQuery<Video[]>({
    queryKey: ['training-videos'],
    queryFn: () => fetchJson('/api/videos'),
    staleTime: 60_000,
  });
}

/* -------------------------------------------------- */
/*  Mutations                                          */
/* -------------------------------------------------- */

export function useAddVideo() {
  const qc = useQueryClient();
  return useMutation<
    { id: number; title: string; url: string },
    Error,
    { title: string; filename: string }
  >({
    mutationFn: (input) =>
      fetchJson('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-videos'] });
    },
  });
}

export function useMarkWatched() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, number>({
    mutationFn: (videoId) =>
      fetchJson(`/api/videos/${videoId}/watch`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-videos'] });
    },
  });
}
