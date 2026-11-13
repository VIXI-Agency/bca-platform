'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import {
  Video,
  ChevronDown,
  ChevronRight,
  Users,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { formatDate } from '@/lib/utils';

interface VideoWatcher {
  userId: number;
  name: string;
  viewedOn: string;
}

interface VideoReport {
  videoId: number;
  videoTitle: string;
  watchedCount: number;
  totalUsers: number;
  completionPercent: number;
  watchers: VideoWatcher[];
}

interface UserVideoSummary {
  userId: number;
  name: string;
  watchedCount: number;
  totalVideos: number;
}

interface VideoReportsData {
  totalVideos: number;
  overallCompletion: number;
  videos: VideoReport[];
  userSummaries: UserVideoSummary[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function useVideoReports() {
  return useQuery<VideoReportsData>({
    queryKey: ['video-reports'],
    queryFn: () => fetchJson('/api/reports/videos'),
  });
}

export default function VideoReportsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;
  const isAdminOrManager = userRole === 1 || userRole === 2;

  const { data, isLoading } = useVideoReports();
  const [expandedVideoId, setExpandedVideoId] = useState<number | null>(null);

  if (!isAdminOrManager) {
    return (
      <>
        <Header title="Video Reports" />
        <div className="flex items-center justify-center pt-20">
          <p style={{ color: 'var(--text-secondary)' }}>
            You do not have permission to access this page.
          </p>
        </div>
      </>
    );
  }

  function toggleExpand(videoId: number) {
    setExpandedVideoId((prev) => (prev === videoId ? null : videoId));
  }

  return (
    <>
      <Header title="Video Reports" />

      <div className="mx-auto max-w-6xl space-y-6 pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loading />
          </div>
        ) : !data ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <Video className="h-7 w-7" style={{ color: 'var(--accent)' }} />
              </div>
              <p
                className="mb-1 text-base font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                No video data available
              </p>
              <p
                className="text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Video reports will appear once training videos are added.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="flex items-center gap-4 py-5">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'var(--accent-subtle)' }}
                  >
                    <Video
                      className="h-6 w-6"
                      style={{ color: 'var(--accent)' }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Total Videos
                    </p>
                    <p
                      className="text-3xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {data.totalVideos}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-4 py-5">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
                  >
                    <CheckCircle2
                      className="h-6 w-6"
                      style={{ color: '#22c55e' }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Overall Completion Rate
                    </p>
                    <p
                      className="text-3xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {data.overallCompletion.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Video Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3
                    className="h-5 w-5"
                    style={{ color: 'var(--accent)' }}
                  />
                  Videos
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-b-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--bg-secondary)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="h-11 w-10 px-4" />
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Video Title
                        </th>
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Watched
                        </th>
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Completion
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-[var(--bg-card)]">
                      {data.videos.map((video) => {
                        const isExpanded = expandedVideoId === video.videoId;
                        return (
                          <ExpandableVideoRow
                            key={video.videoId}
                            video={video}
                            isExpanded={isExpanded}
                            onToggle={() => toggleExpand(video.videoId)}
                          />
                        );
                      })}
                      {data.videos.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="h-24 text-center text-[var(--text-muted)]"
                          >
                            No videos found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Per-User Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users
                    className="h-5 w-5"
                    style={{ color: 'var(--accent)' }}
                  />
                  Per-User Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-b-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--bg-secondary)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          User
                        </th>
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Watched
                        </th>
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Progress
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-[var(--bg-card)]">
                      {data.userSummaries.map((user) => {
                        const pct =
                          user.totalVideos > 0
                            ? (user.watchedCount / user.totalVideos) * 100
                            : 0;
                        return (
                          <tr
                            key={user.userId}
                            className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-elevated)]"
                          >
                            <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                              {user.name}
                            </td>
                            <td className="px-4 py-3 text-[var(--text-primary)]">
                              {user.watchedCount} / {user.totalVideos}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor:
                                        pct === 100
                                          ? 'var(--success)'
                                          : 'var(--accent)',
                                    }}
                                  />
                                </div>
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {pct.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {data.userSummaries.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="h-24 text-center text-[var(--text-muted)]"
                          >
                            No user data available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function ExpandableVideoRow({
  video,
  isExpanded,
  onToggle,
}: {
  video: VideoReport;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-elevated)]"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-[var(--text-muted)]">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </td>
        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
          {video.videoTitle}
        </td>
        <td className="px-4 py-3 text-[var(--text-primary)]">
          {video.watchedCount} / {video.totalUsers}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${video.completionPercent}%`,
                  backgroundColor:
                    video.completionPercent === 100
                      ? 'var(--success)'
                      : 'var(--accent)',
                }}
              />
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              {video.completionPercent.toFixed(0)}%
            </span>
          </div>
        </td>
      </tr>

      {isExpanded && video.watchers.length > 0 && (
        <tr>
          <td colSpan={4} className="bg-[var(--bg-secondary)] px-0 py-0">
            <div className="px-12 py-3">
              <p
                className="mb-2 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Viewers
              </p>
              <div className="space-y-1">
                {video.watchers.map((w) => (
                  <div
                    key={w.userId}
                    className="flex items-center justify-between rounded-md px-3 py-1.5"
                  >
                    <span
                      className="text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {w.name}
                    </span>
                    <Badge variant="outline">
                      {formatDate(w.viewedOn)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}

      {isExpanded && video.watchers.length === 0 && (
        <tr>
          <td colSpan={4} className="bg-[var(--bg-secondary)] px-0 py-0">
            <div className="px-12 py-3">
              <p
                className="text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                No one has watched this video yet.
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
