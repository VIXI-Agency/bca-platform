'use client';

import { useCallback, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  PlayCircle,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useVideos, useMarkWatched, useAddVideo } from '@/hooks/use-videos';

export default function TrainingPage() {
  const { data: videos, isLoading } = useVideos();
  const markWatched = useMarkWatched();
  const addVideo = useAddVideo();
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;
  const isAdmin = userRole === 1 || userRole === 2;

  const [newTitle, setNewTitle] = useState('');
  const [newFilename, setNewFilename] = useState('');

  const handleAddVideo = useCallback(() => {
    const title = newTitle.trim();
    const filename = newFilename.trim();
    if (!title || !filename) return;
    addVideo.mutate(
      { title, filename },
      {
        onSuccess: () => {
          setNewTitle('');
          setNewFilename('');
        },
      },
    );
  }, [newTitle, newFilename, addVideo]);

  const watchedCount = videos?.filter((v) => v.watched).length ?? 0;
  const totalCount = videos?.length ?? 0;
  const progressPct = totalCount > 0 ? (watchedCount / totalCount) * 100 : 0;

  const handleVideoEnded = useCallback(
    (videoId: number) => {
      markWatched.mutate(videoId);
    },
    [markWatched],
  );

  return (
    <>
      <Header title="Training Videos" />

      <div className="mx-auto max-w-[1200px] pt-6">
        {/* ---- Progress bar ---- */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PlayCircle
                  className="h-5 w-5"
                  style={{ color: 'var(--accent)' }}
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Training Progress
                </span>
              </div>
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {watchedCount} of {totalCount} videos watched
              </span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100
                    ? 'var(--success)'
                    : 'linear-gradient(90deg, var(--accent), rgba(0, 212, 255, 0.7))',
                }}
              />
            </div>
            {progressPct === 100 && (
              <p
                className="mt-2 flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--success)' }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                All training videos completed!
              </p>
            )}
          </CardContent>
        </Card>

        {/* ---- Admin: Add Video ---- */}
        {isAdmin && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                Add Training Video
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                Upload the video file to the server first, then register it here.
                The file name must match the uploaded file exactly.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Title (shown to users)
                  </label>
                  <Input
                    placeholder="e.g. Suspensions Breakdown"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    File name (in assets/files)
                  </label>
                  <Input
                    placeholder="e.g. SuspensionsBreakdown.mp4"
                    value={newFilename}
                    onChange={(e) => setNewFilename(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleAddVideo}
                  disabled={addVideo.isPending || !newTitle.trim() || !newFilename.trim()}
                >
                  {addVideo.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add Video
                </Button>
              </div>
              {addVideo.isError && (
                <p className="mt-2 text-xs" style={{ color: 'var(--danger, #ef4444)' }}>
                  {addVideo.error.message}
                </p>
              )}
              {addVideo.isSuccess && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--success)' }}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Video added.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---- Video Grid ---- */}
        {isLoading ? (
          <Loading className="py-16" />
        ) : !videos || videos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-16">
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <PlayCircle
                  className="h-8 w-8"
                  style={{ color: 'var(--accent)' }}
                />
              </div>
              <h3
                className="mb-1 text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                No training videos
              </h3>
              <p
                className="text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Training videos will appear here once they are added.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 pb-6">
            {videos.map((video) => (
              <Card
                key={video.id}
                className="flex flex-col overflow-hidden transition-all hover:border-[var(--accent)]"
                style={{
                  borderColor: video.watched
                    ? 'rgba(34, 197, 94, 0.2)'
                    : undefined,
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base leading-snug">
                      {video.title}
                    </CardTitle>
                    {video.watched ? (
                      <Badge variant="success" className="shrink-0">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Watched
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        <Circle className="mr-1 h-3 w-3" />
                        Not Watched
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col">
                  {/* Video player */}
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(video.id, el);
                    }}
                    controls
                    onEnded={() => handleVideoEnded(video.id)}
                    onContextMenu={(e) => e.preventDefault()}
                    className="w-full rounded-lg"
                    style={{ height: '220px', backgroundColor: '#000' }}
                  >
                    <source
                      src={`/api/media/${encodeURIComponent(video.url.split('/').pop() ?? '')}`}
                      type="video/mp4"
                    />
                    Your browser does not support the video tag.
                  </video>

                  {/* Status indicator */}
                  <div className="mt-3 flex items-center gap-2">
                    {video.watched ? (
                      <div
                        className="flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: 'var(--success)' }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed
                      </div>
                    ) : markWatched.isPending ? (
                      <div
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </div>
                    ) : (
                      <div
                        className="text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Watch the full video to mark as completed
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
