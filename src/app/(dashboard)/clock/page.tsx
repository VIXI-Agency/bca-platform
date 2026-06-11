'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  Play,
  Square,
  Coffee,
  UtensilsCrossed,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  Pencil,
  Timer,
  X,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useClockStatus,
  useClockAction,
  useSkipBreak,
  useWeeklyTimesheet,
  useAvailableWeeks,
} from '@/hooks/use-clock';
import type { ClockAction, ClockStatus } from '@/types';
import { cn } from '@/lib/utils';

/* -------------------------------------------------- */
/*  Constants & Helpers                                */
/* -------------------------------------------------- */

const BREAK_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
const LUNCH_MIN_MS = 30 * 60 * 1000; // 30 minutes

/** Calculate elapsed ms between a stored PST time (epoch-dated ISO) and the current time.
 *  Times in the DB represent PST wall-clock values stored as SQL TIME,
 *  so we compare the hour/minute/second against the current PST time. */
function elapsedSincePst(timeStr: string, now: Date): number {
  const d = new Date(timeStr);
  const storedSec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const nowSec = pstNow.getHours() * 3600 + pstNow.getMinutes() * 60 + pstNow.getSeconds();
  return Math.max(0, (nowSec - storedSec) * 1000);
}

const STATUS_CONFIG: Record<
  ClockStatus,
  { label: string; color: string; bg: string; badgeClass: string }
> = {
  not_clocked_in: {
    label: 'Not Clocked In',
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.1)',
    badgeClass: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  },
  working: {
    label: 'Working',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.1)',
    badgeClass: 'bg-green-500/10 text-green-400 border-green-500/20',
  },
  first_break: {
    label: 'On Break',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.1)',
    badgeClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  },
  lunch: {
    label: 'At Lunch',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.1)',
    badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  },
  second_break: {
    label: 'On Break',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.1)',
    badgeClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  },
  clocked_out: {
    label: 'Clocked Out',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.1)',
    badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
};

const ACTION_CONFIG: Record<
  ClockAction,
  { label: string; icon: typeof Clock; variant: 'default' | 'destructive' | 'outline'; description: string }
> = {
  clockIn: {
    label: 'Clock In',
    icon: Play,
    variant: 'default',
    description: 'Start your work day',
  },
  firstBreakOut: {
    label: 'Start 1st Break',
    icon: Coffee,
    variant: 'outline',
    description: 'Begin your first break (10 min limit)',
  },
  firstBreakIn: {
    label: 'End 1st Break',
    icon: Coffee,
    variant: 'default',
    description: 'Return from your first break',
  },
  lunchOut: {
    label: 'Start Lunch',
    icon: UtensilsCrossed,
    variant: 'outline',
    description: 'Begin your lunch break (30 min minimum)',
  },
  lunchIn: {
    label: 'End Lunch',
    icon: UtensilsCrossed,
    variant: 'default',
    description: 'Return from lunch',
  },
  secondBreakOut: {
    label: 'Start 2nd Break',
    icon: Coffee,
    variant: 'outline',
    description: 'Begin your second break (10 min limit)',
  },
  secondBreakIn: {
    label: 'End 2nd Break',
    icon: Coffee,
    variant: 'default',
    description: 'Return from your second break',
  },
  clockOut: {
    label: 'Clock Out',
    icon: Square,
    variant: 'destructive',
    description: 'End your work day',
  },
};

/** Format a time string (ISO or HH:mm:ss) to readable time.
 *  Times are stored as UTC in the database — extract UTC hours/minutes directly. */
function formatTime(timeStr: string | undefined | null): string {
  if (!timeStr) return '--:--';
  let h: number, m: number;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    h = d.getUTCHours();
    m = d.getUTCMinutes();
  } else {
    [h, m] = timeStr.split(':').map(Number);
  }
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Calculate duration in ms between two time strings */
function durationMs(start: string | undefined, end: string | undefined): number {
  if (!start || !end) return 0;
  return new Date(end).getTime() - new Date(start).getTime();
}

/** Format ms to HH:MM:SS */
function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Format ms to H:MM for table display */
function formatHoursMinutes(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/** Format total hours number to readable string */
function formatTotalHours(hours: number | undefined): string {
  if (hours === undefined || hours === null) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/** Get the current Monday-start week date as YYYY-MM-DD */
function getCurrentWeekDate(): string {
  const now = new Date();
  const pst = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  );
  const day = pst.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Find the most recent Monday
  const diff = (day + 6) % 7;
  const monday = new Date(pst);
  monday.setDate(pst.getDate() - diff);
  return monday.toISOString().split('T')[0];
}

/** Determine which break can be skipped based on nextAction */
function getSkippableBreak(nextAction: ClockAction | null): string | null {
  if (nextAction === 'firstBreakOut') return 'firstBreak';
  if (nextAction === 'lunchOut') return 'lunch';
  if (nextAction === 'secondBreakOut') return 'secondBreak';
  return null;
}

/* -------------------------------------------------- */
/*  Live Clock Hook                                    */
/* -------------------------------------------------- */

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}

/* -------------------------------------------------- */
/*  Toast Alert Component                              */
/* -------------------------------------------------- */

interface AlertToast {
  id: number;
  type: 'error' | 'info' | 'success';
  message: string;
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: AlertToast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-6 top-20 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right',
            toast.type === 'error' &&
              'border-red-500/30 bg-red-500/10 text-red-400',
            toast.type === 'info' &&
              'border-blue-500/30 bg-blue-500/10 text-blue-400',
            toast.type === 'success' &&
              'border-green-500/30 bg-green-500/10 text-green-400'
          )}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-2 shrink-0 opacity-60 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------- */
/*  Timeline Component                                 */
/* -------------------------------------------------- */

interface TimelineStep {
  label: string;
  startTime: string | undefined;
  endTime?: string | undefined;
  isRange: boolean;
  isActive: boolean;
  isOverLimit?: boolean;
}

function MiniTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const hasStart = !!step.startTime;
        const hasEnd = step.isRange ? !!step.endTime : true;
        const isComplete = hasStart && hasEnd && !step.isActive;

        return (
          <div key={i} className="flex items-center gap-3">
            {/* Indicator dot */}
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                isComplete && 'bg-green-500/20',
                step.isActive && 'bg-yellow-500/20',
                !hasStart && 'bg-[var(--bg-secondary)]'
              )}
            >
              {isComplete ? (
                <CheckCircle2
                  className="h-3.5 w-3.5"
                  style={{ color: '#22c55e' }}
                />
              ) : step.isActive ? (
                <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-[var(--text-muted)]" />
              )}
            </div>

            {/* Label & times */}
            <div className="flex min-w-0 flex-1 items-center justify-between">
              <span
                className={cn(
                  'text-sm',
                  hasStart
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)]'
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  'ml-2 text-sm tabular-nums',
                  step.isOverLimit
                    ? 'font-medium text-red-400'
                    : 'text-[var(--text-secondary)]'
                )}
              >
                {!hasStart
                  ? '--'
                  : step.isRange
                    ? `${formatTime(step.startTime)} - ${step.isActive ? 'now' : formatTime(step.endTime)}`
                    : formatTime(step.startTime)}
                {isComplete && !step.isRange && ' \u2713'}
                {isComplete && step.isRange && ' \u2713'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------- */
/*  Weekly Timesheet Component                         */
/* -------------------------------------------------- */

const ORDERED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TABLE_COLUMNS = [
  'Day',
  'Clock In',
  '1st Break Out',
  '1st Break In',
  'Lunch Out',
  'Lunch In',
  '2nd Break Out',
  '2nd Break In',
  'Clock Out',
  'Total',
] as const;

function WeeklyTimesheet() {
  const { data: weeks, isLoading: weeksLoading } = useAvailableWeeks();
  const [selectedWeek, setSelectedWeek] = useState<string>('');

  // Set default week once available
  useEffect(() => {
    if (!selectedWeek && weeks && weeks.length > 0) {
      setSelectedWeek(weeks[0].date);
    } else if (!selectedWeek && !weeksLoading) {
      setSelectedWeek(getCurrentWeekDate());
    }
  }, [weeks, weeksLoading, selectedWeek]);

  const { data: timesheet, isLoading: timesheetLoading } =
    useWeeklyTimesheet(selectedWeek);

  // Sort days in week order
  const sortedDays = useMemo(() => {
    if (!timesheet?.data) return [];
    const dayMap = new Map(timesheet.data.map((d) => [d.dayOfWeek, d]));
    return ORDERED_DAYS.map((day) => ({
      day,
      log: dayMap.get(day) || null,
    }));
  }, [timesheet]);

  /** Check if a break duration exceeds 10 min */
  function isBreakOver(
    start: string | undefined,
    end: string | undefined
  ): boolean {
    if (!start || !end) return false;
    return durationMs(start, end) > BREAK_LIMIT_MS;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" style={{ color: 'var(--accent)' }} />
            Weekly Timesheet
          </CardTitle>

          <div className="w-56">
            {weeksLoading ? (
              <Loading size="sm" />
            ) : (
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger>
                  <SelectValue placeholder="Select week" />
                </SelectTrigger>
                <SelectContent>
                  {weeks?.map((w) => (
                    <SelectItem key={w.date} value={w.date}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {timesheetLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loading />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {TABLE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedDays.map(({ day, log }) => {
                  const firstBreakOver = isBreakOver(
                    log?.firstBreakOut,
                    log?.firstBreakIn
                  );
                  const secondBreakOver = isBreakOver(
                    log?.secondBreakOut,
                    log?.secondBreakIn
                  );

                  return (
                    <tr
                      key={day}
                      className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-secondary)]/50"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-medium text-[var(--text-primary)]">
                        <div className="flex items-center gap-1.5">
                          {day}
                          {log?.isModifiedByAdmin && (
                            <span title="Modified by admin">
                              <Pencil className="h-3 w-3 text-[var(--text-muted)]" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[var(--text-secondary)]">
                        {formatTime(log?.clockIn)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-3 tabular-nums',
                          firstBreakOver
                            ? 'bg-red-500/10 font-medium text-red-400'
                            : 'text-[var(--text-secondary)]'
                        )}
                      >
                        {formatTime(log?.firstBreakOut)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-3 tabular-nums',
                          firstBreakOver
                            ? 'bg-red-500/10 font-medium text-red-400'
                            : 'text-[var(--text-secondary)]'
                        )}
                      >
                        {formatTime(log?.firstBreakIn)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[var(--text-secondary)]">
                        {formatTime(log?.lunchOut)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[var(--text-secondary)]">
                        {formatTime(log?.lunchIn)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-3 tabular-nums',
                          secondBreakOver
                            ? 'bg-red-500/10 font-medium text-red-400'
                            : 'text-[var(--text-secondary)]'
                        )}
                      >
                        {formatTime(log?.secondBreakOut)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-3 tabular-nums',
                          secondBreakOver
                            ? 'bg-red-500/10 font-medium text-red-400'
                            : 'text-[var(--text-secondary)]'
                        )}
                      >
                        {formatTime(log?.secondBreakIn)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[var(--text-secondary)]">
                        {formatTime(log?.clockOut)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums text-[var(--text-primary)]">
                        {formatTotalHours(log?.totalHours)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)]">
                  <td
                    colSpan={9}
                    className="px-3 py-3 text-right text-sm font-semibold text-[var(--text-primary)]"
                  >
                    Week Total
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-lg font-bold tabular-nums text-[var(--accent)]">
                    {timesheet ? formatTotalHours(timesheet.weekTotal) : '--'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------- */
/*  Main Page Component                                */
/* -------------------------------------------------- */

export default function ClockPage() {
  const now = useLiveClock();

  const {
    data: clockData,
    isLoading: clockLoading,
    error: clockError,
  } = useClockStatus();
  const clockAction = useClockAction();
  const skipBreak = useSkipBreak();

  const [toasts, setToasts] = useState<AlertToast[]>([]);

  const addToast = useCallback(
    (type: AlertToast['type'], message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, message }]);
      // Auto-dismiss after 6 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    },
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Derived state
  const status: ClockStatus = clockData?.status ?? 'not_clocked_in';
  const nextAction = clockData?.nextAction ?? null;
  const timeLog = clockData?.data ?? null;
  const statusConfig = STATUS_CONFIG[status];

  // Part-time status comes from the user's DB flag (returned by the status API),
  // matching the authorization in /api/clock/skip. Falls back to false.
  const isPartTime = clockData?.isPartTime ?? false;
  const skippableBreak = getSkippableBreak(nextAction);

  // Live elapsed timer: time since clock in (comparing PST times)
  const elapsedSinceClockIn = useMemo(() => {
    if (!timeLog?.clockIn || status === 'not_clocked_in') return 0;
    return elapsedSincePst(timeLog.clockIn, now);
  }, [timeLog?.clockIn, now, status]);

  // Live break/lunch timer (comparing PST times)
  const breakTimerMs = useMemo(() => {
    if (status === 'first_break' && timeLog?.firstBreakOut) {
      return elapsedSincePst(timeLog.firstBreakOut, now);
    }
    if (status === 'second_break' && timeLog?.secondBreakOut) {
      return elapsedSincePst(timeLog.secondBreakOut, now);
    }
    if (status === 'lunch' && timeLog?.lunchOut) {
      return elapsedSincePst(timeLog.lunchOut, now);
    }
    return 0;
  }, [status, timeLog, now]);

  const isOnBreak = status === 'first_break' || status === 'second_break';
  const isOnLunch = status === 'lunch';
  const breakExceeded = isOnBreak && breakTimerMs > BREAK_LIMIT_MS;

  // Current time in PST
  const pstTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    hour12: true,
  });

  const pstDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  // Build timeline steps
  const timelineSteps: TimelineStep[] = useMemo(() => {
    if (!timeLog) return [];

    const firstBreakDone =
      (timeLog.firstBreakOut && timeLog.firstBreakIn) || false;
    const firstBreakOver =
      firstBreakDone &&
      durationMs(timeLog.firstBreakOut!, timeLog.firstBreakIn!) > BREAK_LIMIT_MS;

    const secondBreakDone =
      (timeLog.secondBreakOut && timeLog.secondBreakIn) || false;
    const secondBreakOver =
      secondBreakDone &&
      durationMs(timeLog.secondBreakOut!, timeLog.secondBreakIn!) >
        BREAK_LIMIT_MS;

    return [
      {
        label: 'Clock In',
        startTime: timeLog.clockIn,
        isRange: false,
        isActive: false,
      },
      {
        label: '1st Break',
        startTime: timeLog.firstBreakOut,
        endTime: timeLog.firstBreakIn,
        isRange: true,
        isActive: status === 'first_break',
        isOverLimit: firstBreakOver || (status === 'first_break' && breakExceeded),
      },
      {
        label: 'Lunch',
        startTime: timeLog.lunchOut,
        endTime: timeLog.lunchIn,
        isRange: true,
        isActive: status === 'lunch',
      },
      {
        label: '2nd Break',
        startTime: timeLog.secondBreakOut,
        endTime: timeLog.secondBreakIn,
        isRange: true,
        isActive: status === 'second_break',
        isOverLimit:
          secondBreakOver || (status === 'second_break' && breakExceeded),
      },
      {
        label: 'Clock Out',
        startTime: timeLog.clockOut,
        isRange: false,
        isActive: false,
      },
    ];
  }, [timeLog, status, breakExceeded]);

  // Handle main action
  async function handleAction() {
    if (!nextAction) return;
    try {
      await clockAction.mutateAsync({ action: nextAction });

      // Show success feedback
      const config = ACTION_CONFIG[nextAction];
      if (config) {
        addToast('success', `${config.label} recorded`);
      }
    } catch (err: any) {
      const message = err?.message || 'Something went wrong';

      // Check for specific error patterns
      if (message.toLowerCase().includes('lunch') && message.includes('30')) {
        addToast('error', message);
      } else {
        addToast('error', message);
      }
    }
  }

  // Handle skip break
  async function handleSkip() {
    if (!skippableBreak) return;
    try {
      await skipBreak.mutateAsync({ breakType: skippableBreak });
      const label = skippableBreak === 'firstBreak' ? '1st break' : skippableBreak === 'lunch' ? 'Lunch' : '2nd break';
      addToast('info', `${label} skipped`);
    } catch (err: any) {
      addToast('error', err?.message || 'Could not skip break');
    }
  }

  const actionConfig = nextAction ? ACTION_CONFIG[nextAction] : null;
  const ActionIcon = actionConfig?.icon ?? Clock;
  const isActionLoading = clockAction.isPending || skipBreak.isPending;

  return (
    <>
      <Header title="Time Clock" />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="mx-auto max-w-7xl space-y-6 pt-6">
        {/* ======== CURRENT STATUS CARD ======== */}
        <Card className="relative overflow-hidden">
          {/* Subtle gradient accent */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              background: `linear-gradient(135deg, ${statusConfig.color} 0%, transparent 60%)`,
            }}
          />

          <CardContent className="relative p-6">
            {clockLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loading size="lg" />
              </div>
            ) : clockError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <AlertCircle className="h-8 w-8 text-red-400" />
                <p className="text-sm text-red-400">
                  Failed to load clock status. Please refresh.
                </p>
              </div>
            ) : (
              <div className="grid gap-8 lg:grid-cols-[1fr_auto_1fr]">
                {/* LEFT: Status & Timers */}
                <div className="flex flex-col items-center gap-6 lg:items-start">
                  {/* Current time */}
                  <div className="text-center lg:text-left">
                    <p className="text-sm font-medium text-[var(--text-muted)]">
                      {pstDate}
                    </p>
                    <p
                      className="mt-1 text-4xl font-bold tabular-nums tracking-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {pstTime}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Pacific Standard Time
                    </p>
                  </div>

                  {/* Status badge */}
                  <div
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-4 py-1.5',
                      statusConfig.badgeClass
                    )}
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: statusConfig.color }}
                    />
                    <span className="text-sm font-semibold">
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Elapsed timer (since clock in) */}
                  {status !== 'not_clocked_in' && (
                    <div className="text-center lg:text-left">
                      <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        {status === 'clocked_out'
                          ? 'Total Today'
                          : 'Time Since Clock In'}
                      </p>
                      <p
                        className="mt-1 text-3xl font-bold tabular-nums"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {status === 'clocked_out'
                          ? formatTotalHours(timeLog?.totalHours)
                          : formatDuration(elapsedSinceClockIn)}
                      </p>
                    </div>
                  )}

                  {/* Break/lunch timer */}
                  {(isOnBreak || isOnLunch) && (
                    <div className="text-center lg:text-left">
                      <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        {isOnLunch ? 'Lunch Duration' : 'Break Duration'}
                      </p>
                      <p
                        className={cn(
                          'mt-1 text-3xl font-bold tabular-nums',
                          breakExceeded ? 'text-red-400' : ''
                        )}
                        style={
                          !breakExceeded
                            ? { color: statusConfig.color }
                            : undefined
                        }
                      >
                        {formatDuration(breakTimerMs)}
                      </p>
                      {isOnBreak && (
                        <p
                          className={cn(
                            'mt-1 text-xs',
                            breakExceeded
                              ? 'font-medium text-red-400'
                              : 'text-[var(--text-muted)]'
                          )}
                        >
                          {breakExceeded
                            ? 'Break exceeded 10-minute limit!'
                            : `${formatHoursMinutes(Math.max(0, BREAK_LIMIT_MS - breakTimerMs))} remaining`}
                        </p>
                      )}
                      {isOnLunch && breakTimerMs < LUNCH_MIN_MS && (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Min 30 min &middot;{' '}
                          {formatHoursMinutes(
                            Math.max(0, LUNCH_MIN_MS - breakTimerMs)
                          )}{' '}
                          remaining
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* DIVIDER */}
                <div className="hidden lg:block">
                  <Separator orientation="vertical" className="h-full" />
                </div>
                <div className="lg:hidden">
                  <Separator />
                </div>

                {/* RIGHT: Action Button & Timeline */}
                <div className="flex flex-col items-center gap-6 lg:items-center">
                  {/* Main Action Button */}
                  {nextAction && actionConfig && (
                    <div className="flex w-full flex-col items-center gap-3">
                      <p className="text-sm text-[var(--text-secondary)]">
                        {actionConfig.description}
                      </p>

                      <div className="flex items-center gap-3">
                        <Button
                          variant={actionConfig.variant}
                          size="lg"
                          className={cn(
                            'h-14 min-w-[200px] text-base font-semibold',
                            actionConfig.variant === 'default' &&
                              'shadow-[0_0_20px_rgba(0,212,255,0.2)]'
                          )}
                          onClick={handleAction}
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? (
                            <Loading size="sm" />
                          ) : (
                            <>
                              <ActionIcon className="h-5 w-5" />
                              {actionConfig.label}
                            </>
                          )}
                        </Button>

                        {/* Skip button: lunch for all users, breaks for part-time only */}
                        {skippableBreak && (skippableBreak === 'lunch' || isPartTime) && (
                          <Button
                            variant="ghost"
                            size="lg"
                            className="h-14 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            onClick={handleSkip}
                            disabled={isActionLoading}
                          >
                            <SkipForward className="h-4 w-4" />
                            {skippableBreak === 'lunch' ? 'Skip Lunch' : 'Skip Break'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Done for the day message */}
                  {status === 'clocked_out' && (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <CheckCircle2 className="h-10 w-10 text-blue-400" />
                      <p className="text-lg font-semibold text-[var(--text-primary)]">
                        Done for today!
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Your hours have been recorded.
                      </p>
                    </div>
                  )}

                  {/* No action (not clocked in yet) */}
                  {status === 'not_clocked_in' && !nextAction && (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Clock className="h-10 w-10 text-[var(--text-muted)]" />
                      <p className="text-sm text-[var(--text-secondary)]">
                        Ready to start your day?
                      </p>
                    </div>
                  )}

                  {/* Today's Timeline */}
                  {timeLog && timelineSteps.length > 0 && (
                    <div className="w-full max-w-xs">
                      <Separator className="mb-4" />
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Today&apos;s Timeline
                      </p>
                      <MiniTimeline steps={timelineSteps} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ======== WEEKLY TIMESHEET ======== */}
        <WeeklyTimesheet />
      </div>
    </>
  );
}
