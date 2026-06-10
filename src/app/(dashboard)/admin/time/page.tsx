'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Clock,
  Search,
  Pencil,
  Wifi,
  WifiOff,
  Users,
  ClipboardList,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  History,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  useEmployeeStatuses,
  useEmployeeList,
  useEmployeeTimesheet,
  useEditTime,
  useDisconnectEmployee,
  useTimeHistory,
  type EmployeeStatus,
  type DayLog,
  type Audit,
  type TimeHistoryEntry,
} from '@/hooks/use-admin-time';

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

/** Get the Monday that starts the work week containing `date`. */
function getWorkWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // 0=Sun,1=Mon,...,5=Fri,6=Sat
  const day = d.getDay();
  // Days since last Monday: Mon=0, Tue=1, ..., Fri=4, Sat=5, Sun=6
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatWeekLabel(monday: Date): string {
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4); // Monday + 4 = Friday
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString('en-US', opts)} - ${friday.toLocaleDateString('en-US', opts)}, ${friday.getFullYear()}`;
}

function generateWeekOptions(count: number): { value: string; label: string }[] {
  const weeks: { value: string; label: string }[] = [];
  const current = getWorkWeekStart(new Date());
  for (let i = 0; i < count; i++) {
    const monday = new Date(current);
    monday.setDate(monday.getDate() - i * 7);
    weeks.push({
      value: formatDateISO(monday),
      label: formatWeekLabel(monday),
    });
  }
  return weeks;
}

function formatTime(time?: string | null): string {
  if (!time) return '--:--';
  let h: number, m: number;
  if (time.includes('T')) {
    const d = new Date(time);
    h = d.getUTCHours();
    m = d.getUTCMinutes();
  } else {
    [h, m] = time.split(':').map(Number);
  }
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Compute break duration in minutes between out and in times. */
function breakMinutes(out?: string | null, inTime?: string | null): number | null {
  if (!out || !inTime) return null;
  const toMs = (t: string) => {
    if (t.includes('T')) return new Date(t).getTime();
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const outMs = toMs(out);
  const inMs = toMs(inTime);
  if (typeof outMs === 'number' && typeof inMs === 'number') {
    // If both are epoch ms
    if (out.includes('T')) return Math.round((inMs - outMs) / 60000);
    return inMs - outMs; // already in minutes
  }
  return null;
}

/** Live elapsed minutes from a start time to now (PST-aware, max 24h). */
function elapsedMinutes(start?: string | null): number {
  if (!start) return 0;
  // Start time is PST stored as UTC-labeled (e.g., 09:50 PST → T09:50:00.000Z)
  const d = new Date(start);
  const startMinOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  // Get current PST time using Intl (handles DST automatically)
  const pstParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date());
  const nowH = parseInt(pstParts.find(p => p.type === 'hour')?.value ?? '0');
  const nowM = parseInt(pstParts.find(p => p.type === 'minute')?.value ?? '0');
  const nowMinOfDay = nowH * 60 + nowM;
  const diff = nowMinOfDay - startMinOfDay;
  // Clamp to 0..1440 (one day max) to prevent negative or astronomically large values
  return Math.max(0, Math.min(diff, 1440));
}

function formatDuration(mins: number | null): string {
  if (mins === null) return '--:--';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatMinutes(mins: number): string {
  return `${mins} min`;
}

const STATUS_CONFIG: Record<
  EmployeeStatus['status'],
  { label: string; color: string; bg: string }
> = {
  working: {
    label: 'Working',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.1)',
  },
  on_break: {
    label: 'On Break',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.1)',
  },
  at_lunch: {
    label: 'At Lunch',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.1)',
  },
  not_clocked_in: {
    label: 'Not Clocked In',
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.1)',
  },
  clocked_out: {
    label: 'Clocked Out',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
};

const EDITABLE_FIELDS: { key: string; label: string }[] = [
  { key: 'clockIn', label: 'Clock In' },
  { key: 'firstBreakOut', label: '1st Break Out' },
  { key: 'firstBreakIn', label: '1st Break In' },
  { key: 'lunchOut', label: 'Lunch Out' },
  { key: 'lunchIn', label: 'Lunch In' },
  { key: 'secondBreakOut', label: '2nd Break Out' },
  { key: 'secondBreakIn', label: '2nd Break In' },
  { key: 'clockOut', label: 'Clock Out' },
];

function fieldLabel(key: string): string {
  return EDITABLE_FIELDS.find((f) => f.key === key)?.label ?? key;
}

/* -------------------------------------------------- */
/*  Sub-components                                     */
/* -------------------------------------------------- */

function StatusBadge({ status }: { status: EmployeeStatus['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_clocked_in;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}

function LiveTimer({ start, warn }: { start?: string | null; warn?: boolean }) {
  const [mins, setMins] = useState(() => elapsedMinutes(start));

  useEffect(() => {
    if (!start) return;
    setMins(elapsedMinutes(start));
    const id = setInterval(() => setMins(elapsedMinutes(start)), 15000);
    return () => clearInterval(id);
  }, [start]);

  if (!start) return null;

  const exceeded = warn && mins > 10;

  return (
    <span
      className={`text-xs font-medium ${exceeded ? 'rounded bg-red-500/10 px-1.5 py-0.5 text-red-400' : 'text-[var(--text-secondary)]'}`}
    >
      {formatMinutes(mins)}
      {exceeded && ' (exceeded)'}
    </span>
  );
}

/* -------------------------------------------------- */
/*  Main Page                                          */
/* -------------------------------------------------- */

export default function AdminTimePage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;

  // Guard: Admin (1) or Manager (2) only
  if (userRole !== 1 && userRole !== 2) {
    return (
      <>
        <Header title="Time Management" />
        <div className="flex items-center justify-center pt-20">
          <p style={{ color: 'var(--text-secondary)' }}>
            You do not have permission to access this page.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Time Management" />
      <div className="mx-auto max-w-7xl space-y-6 pt-6">
        <Tabs defaultValue="status">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="status" className="gap-1.5">
              <Users className="h-4 w-4" />
              Employee Status
            </TabsTrigger>
            <TabsTrigger value="edit" className="gap-1.5">
              <Pencil className="h-4 w-4" />
              Edit Time
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              Time History
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="status">
            <EmployeeStatusTab />
          </TabsContent>

          <TabsContent value="edit">
            <EditTimeTab />
          </TabsContent>

          <TabsContent value="history">
            <TimeHistoryTab />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/* ================================================== */
/*  TAB 1: Employee Status                             */
/* ================================================== */

function EmployeeStatusTab() {
  const { data: statuses, isLoading, dataUpdatedAt } = useEmployeeStatuses();
  const disconnectMutation = useDisconnectEmployee();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Disconnect dialog
  const [disconnectTarget, setDisconnectTarget] =
    useState<EmployeeStatus | null>(null);
  const [disconnectReason, setDisconnectReason] = useState('');
  const [disconnectAction, setDisconnectAction] = useState<
    'disconnect' | 'reconnect'
  >('disconnect');

  const filtered = useMemo(() => {
    if (!statuses) return [];
    return statuses.filter((emp) => {
      const matchSearch = emp.name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchStatus =
        statusFilter === 'all' || emp.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [statuses, search, statusFilter]);

  // Group by status for summary
  const summary = useMemo(() => {
    if (!statuses) return { working: 0, on_break: 0, at_lunch: 0, not_clocked_in: 0, clocked_out: 0 };
    const counts: Record<string, number> = {};
    statuses.forEach((e) => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });
    return counts;
  }, [statuses]);

  function openDisconnectDialog(
    emp: EmployeeStatus,
    action: 'disconnect' | 'reconnect'
  ) {
    setDisconnectTarget(emp);
    setDisconnectAction(action);
    setDisconnectReason('');
  }

  async function handleDisconnect() {
    if (!disconnectTarget) return;
    await disconnectMutation.mutateAsync({
      userId: disconnectTarget.userId,
      action: disconnectAction,
      reason: disconnectReason || undefined,
    });
    setDisconnectTarget(null);
    setDisconnectReason('');
  }

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <div className="space-y-6 pt-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            'working',
            'on_break',
            'at_lunch',
            'not_clocked_in',
            'clocked_out',
          ] as const
        ).map((st) => {
          const cfg = STATUS_CONFIG[st];
          return (
            <Card
              key={st}
              className="cursor-pointer transition-all hover:scale-[1.02]"
              onClick={() =>
                setStatusFilter(statusFilter === st ? 'all' : st)
              }
            >
              <CardContent className="flex items-center gap-3 py-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: cfg.bg }}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: cfg.color }}
                  />
                </div>
                <div>
                  <p
                    className="text-2xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {summary[st] || 0}
                  </p>
                  <p
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {cfg.label}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search / filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {lastUpdate && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <RefreshCw className="h-3 w-3" />
            Updated {lastUpdate}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users
              className="mb-4 h-10 w-10"
              style={{ color: 'var(--text-muted)' }}
            />
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {statuses?.length ? 'No employees match your filters.' : 'No employees found.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Employee grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((emp) => {
            const isActive =
              emp.status === 'working' ||
              emp.status === 'on_break' ||
              emp.status === 'at_lunch';
            const isBreak =
              emp.status === 'on_break' || emp.status === 'at_lunch';

            return (
              <Card key={emp.userId} className="group transition-all">
                <CardContent className="space-y-3 py-4">
                  {/* Name + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {emp.name}
                      </p>
                      {emp.clockIn && (
                        <div className="mt-1 space-y-0.5 text-xs text-[var(--text-muted)]">
                          <p><Clock className="mr-1 inline h-3 w-3" />In: {formatTime(emp.clockIn)}</p>
                          {emp.firstBreakOut && <p>1st Break: {formatTime(emp.firstBreakOut)}{emp.firstBreakIn ? ` - ${formatTime(emp.firstBreakIn)}` : ' (active)'}</p>}
                          {emp.lunchOut && <p>Lunch: {formatTime(emp.lunchOut)}{emp.lunchIn ? ` - ${formatTime(emp.lunchIn)}` : ' (active)'}</p>}
                          {emp.secondBreakOut && <p>2nd Break: {formatTime(emp.secondBreakOut)}{emp.secondBreakIn ? ` - ${formatTime(emp.secondBreakIn)}` : ' (active)'}</p>}
                          {emp.clockOut && <p><Clock className="mr-1 inline h-3 w-3" />Out: {formatTime(emp.clockOut)}</p>}
                        </div>
                      )}
                    </div>
                    <StatusBadge status={emp.status} />
                  </div>

                  {/* Break timer */}
                  {isBreak && emp.currentBreakStart && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">
                        Duration:
                      </span>
                      <LiveTimer start={emp.currentBreakStart} warn={emp.status === 'on_break'} />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-1">
                    {isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() =>
                          openDisconnectDialog(emp, 'disconnect')
                        }
                      >
                        <WifiOff className="h-3 w-3" />
                        Disconnect
                      </Button>
                    )}
                    {emp.isDisconnected && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() =>
                          openDisconnectDialog(emp, 'reconnect')
                        }
                      >
                        <Wifi className="h-3 w-3" />
                        Reconnect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Disconnect / Reconnect Dialog */}
      <Dialog
        open={!!disconnectTarget}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {disconnectAction === 'disconnect'
                ? 'Disconnect Employee'
                : 'Reconnect Employee'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {disconnectAction === 'disconnect'
                ? `Are you sure you want to disconnect ${disconnectTarget?.name}? They will be clocked out immediately.`
                : `Are you sure you want to reconnect ${disconnectTarget?.name}?`}
            </p>
            <div className="space-y-2">
              <Label htmlFor="disconnect-reason">
                Reason {disconnectAction === 'disconnect' ? '(recommended)' : '(optional)'}
              </Label>
              <textarea
                id="disconnect-reason"
                value={disconnectReason}
                onChange={(e) => setDisconnectReason(e.target.value)}
                rows={3}
                placeholder="Enter reason..."
                className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisconnectTarget(null)}
              disabled={disconnectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={disconnectAction === 'disconnect' ? 'destructive' : 'default'}
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <>
                  <Loading size="sm" />
                  Processing...
                </>
              ) : disconnectAction === 'disconnect' ? (
                'Disconnect'
              ) : (
                'Reconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================================== */
/*  TAB 2: Edit Time                                   */
/* ================================================== */

function EditTimeTab() {
  const { data: employees, isLoading: empLoading } = useEmployeeList();
  const editMutation = useEditTime();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [empSearch, setEmpSearch] = useState('');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<DayLog | null>(null);
  const [editingField, setEditingField] = useState('');
  const [editNewValue, setEditNewValue] = useState('');
  const [editReason, setEditReason] = useState('');

  const weekOptions = useMemo(() => generateWeekOptions(12), []);

  // Default to current week
  useEffect(() => {
    if (!selectedWeek && weekOptions.length > 0) {
      setSelectedWeek(weekOptions[0].value);
    }
  }, [weekOptions, selectedWeek]);

  const userId = selectedUserId ? parseInt(selectedUserId, 10) : 0;
  const {
    data: timesheetData,
    isLoading: timesheetLoading,
  } = useEmployeeTimesheet(userId, selectedWeek);

  const dayLogs = timesheetData?.data ?? [];
  const weekAudits = timesheetData?.audits ?? [];

  // Filtered employees for dropdown search
  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    if (!empSearch) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(empSearch.toLowerCase())
    );
  }, [employees, empSearch]);

  const selectedEmployeeName = useMemo(() => {
    if (!employees || !selectedUserId) return '';
    return employees.find((e) => e.userId === parseInt(selectedUserId, 10))?.name ?? '';
  }, [employees, selectedUserId]);

  function openEditDialog(day: DayLog, field: string) {
    setEditingDay(day);
    setEditingField(field);
    const currentVal = (day as unknown as Record<string, unknown>)[field];
    setEditNewValue(
      typeof currentVal === 'string' && currentVal.includes('T')
        ? currentVal.substring(11, 16)
        : typeof currentVal === 'string'
          ? currentVal
          : ''
    );
    setEditReason('');
    setEditDialogOpen(true);
  }

  async function handleEditSave() {
    if (!editingDay || !editReason.trim() || !editNewValue.trim()) return;
    await editMutation.mutateAsync({
      userId: parseInt(selectedUserId, 10),
      date: editingDay.date,
      field: editingField,
      value: editNewValue.trim(),
      reason: editReason.trim(),
    });
    setEditDialogOpen(false);
  }

  /** Compute break duration and whether it exceeds 10 minutes. */
  function breakInfo(
    out?: string | null,
    inTime?: string | null
  ): { text: string; exceeded: boolean } {
    const mins = breakMinutes(out, inTime);
    if (mins === null) return { text: '--', exceeded: false };
    return { text: `${mins} min`, exceeded: mins > 10 };
  }

  function navigateWeek(direction: -1 | 1) {
    const idx = weekOptions.findIndex((w) => w.value === selectedWeek);
    const newIdx = idx - direction; // -direction because weeks are newest-first
    if (newIdx >= 0 && newIdx < weekOptions.length) {
      setSelectedWeek(weekOptions[newIdx].value);
    }
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Selectors */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Employee selector */}
            <div className="min-w-[240px] flex-1 space-y-2">
              <Label>Employee</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <Input
                      placeholder="Search..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {empLoading && (
                    <div className="flex justify-center py-4">
                      <Loading size="sm" />
                    </div>
                  )}
                  {filteredEmployees.map((emp) => (
                    <SelectItem
                      key={emp.userId}
                      value={String(emp.userId)}
                    >
                      {emp.name}
                    </SelectItem>
                  ))}
                  {!empLoading && filteredEmployees.length === 0 && (
                    <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      No employees found.
                    </p>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Week selector with arrows */}
            <div className="min-w-[280px] flex-1 space-y-2">
              <Label>Week</Label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => navigateWeek(-1)}
                  disabled={
                    weekOptions.findIndex((w) => w.value === selectedWeek) >=
                    weekOptions.length - 1
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select week..." />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => navigateWeek(1)}
                  disabled={
                    weekOptions.findIndex((w) => w.value === selectedWeek) <= 0
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prompt to select */}
      {!selectedUserId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList
              className="mb-4 h-10 w-10"
              style={{ color: 'var(--text-muted)' }}
            />
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Select an employee to view and edit their timesheet.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Timesheet loading */}
      {selectedUserId && timesheetLoading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}

      {/* Timesheet table */}
      {selectedUserId && !timesheetLoading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              {selectedEmployeeName}&apos;s Timesheet
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b text-left text-xs font-medium uppercase tracking-wider"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <th className="pb-3 pr-3">Day</th>
                    <th className="pb-3 px-3">Clock In</th>
                    <th className="pb-3 px-3">1st Break</th>
                    <th className="pb-3 px-3">Lunch</th>
                    <th className="pb-3 px-3">2nd Break</th>
                    <th className="pb-3 px-3">Clock Out</th>
                    <th className="pb-3 pl-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dayLogs.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-sm"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        No time entries for this week.
                      </td>
                    </tr>
                  )}
                  {dayLogs.map((day) => {
                    const dayDate = new Date(day.date + 'T00:00:00');
                    // Derive the weekday name from the actual date (robust to missing days)
                    const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
                    const dayLabel = `${dayName} ${dayDate.getMonth() + 1}/${dayDate.getDate()}`;

                    const break1 = breakInfo(
                      day.firstBreakOut,
                      day.firstBreakIn
                    );
                    const break2 = breakInfo(
                      day.secondBreakOut,
                      day.secondBreakIn
                    );
                    const lunch = breakInfo(day.lunchOut, day.lunchIn);

                    const modified = new Set(day.modifiedFields ?? []);

                    return (
                      <tr
                        key={day.date}
                        className="border-b transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        {/* Day */}
                        <td
                          className="py-3 pr-3 font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {dayLabel}
                        </td>

                        {/* Clock In */}
                        <td className="px-3 py-3">
                          <TimeCell
                            value={formatTime(day.clockIn)}
                            modified={modified.has('clockIn')}
                            onClick={() => openEditDialog(day, 'clockIn')}
                          />
                        </td>

                        {/* 1st Break */}
                        <td className="px-3 py-3">
                          <BreakCell
                            outValue={formatTime(day.firstBreakOut)}
                            inValue={formatTime(day.firstBreakIn)}
                            duration={break1.text}
                            exceeded={break1.exceeded}
                            modifiedOut={modified.has('firstBreakOut')}
                            modifiedIn={modified.has('firstBreakIn')}
                            onClickOut={() =>
                              openEditDialog(day, 'firstBreakOut')
                            }
                            onClickIn={() =>
                              openEditDialog(day, 'firstBreakIn')
                            }
                          />
                        </td>

                        {/* Lunch */}
                        <td className="px-3 py-3">
                          <BreakCell
                            outValue={formatTime(day.lunchOut)}
                            inValue={formatTime(day.lunchIn)}
                            duration={lunch.text}
                            exceeded={false}
                            modifiedOut={modified.has('lunchOut')}
                            modifiedIn={modified.has('lunchIn')}
                            onClickOut={() =>
                              openEditDialog(day, 'lunchOut')
                            }
                            onClickIn={() =>
                              openEditDialog(day, 'lunchIn')
                            }
                          />
                        </td>

                        {/* 2nd Break */}
                        <td className="px-3 py-3">
                          <BreakCell
                            outValue={formatTime(day.secondBreakOut)}
                            inValue={formatTime(day.secondBreakIn)}
                            duration={break2.text}
                            exceeded={break2.exceeded}
                            modifiedOut={modified.has('secondBreakOut')}
                            modifiedIn={modified.has('secondBreakIn')}
                            onClickOut={() =>
                              openEditDialog(day, 'secondBreakOut')
                            }
                            onClickIn={() =>
                              openEditDialog(day, 'secondBreakIn')
                            }
                          />
                        </td>

                        {/* Clock Out */}
                        <td className="px-3 py-3">
                          <TimeCell
                            value={formatTime(day.clockOut)}
                            modified={modified.has('clockOut')}
                            onClick={() => openEditDialog(day, 'clockOut')}
                          />
                        </td>

                        {/* Total */}
                        <td
                          className="py-3 pl-3 text-right font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {day.totalHours != null
                            ? formatDuration(Math.round(day.totalHours * 60))
                            : '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Week audit log */}
      {selectedUserId && !timesheetLoading && weekAudits.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              Modifications This Week
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <AuditTable audits={weekAudits} showEmployee={false} />
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Info fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-[var(--text-muted)]">
                  Employee
                </Label>
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {selectedEmployeeName}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--text-muted)]">Date</Label>
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {editingDay
                    ? new Date(editingDay.date + 'T00:00:00').toLocaleDateString(
                        'en-US',
                        {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        }
                      )
                    : ''}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-[var(--text-muted)]">Field</Label>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {fieldLabel(editingField)}
              </p>
            </div>

            <Separator />

            {/* Current value */}
            <div className="space-y-1">
              <Label className="text-xs text-[var(--text-muted)]">
                Current Value
              </Label>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {editingDay
                  ? formatTime(
                      (editingDay as unknown as Record<string, unknown>)[
                        editingField
                      ] as string | undefined
                    )
                  : '--:--'}
              </p>
            </div>

            {/* New value */}
            <div className="space-y-2">
              <Label htmlFor="edit-new-value">New Time (HH:mm)</Label>
              <Input
                id="edit-new-value"
                type="time"
                value={editNewValue}
                onChange={(e) => setEditNewValue(e.target.value)}
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="edit-reason">
                Reason <span className="text-red-400">*</span>
              </Label>
              <textarea
                id="edit-reason"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                rows={3}
                placeholder="Explain why this time is being changed..."
                className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={editMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={
                !editNewValue.trim() ||
                !editReason.trim() ||
                editMutation.isPending
              }
            >
              {editMutation.isPending ? (
                <>
                  <Loading size="sm" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------- */
/*  Timesheet cell components                          */
/* -------------------------------------------------- */

function TimeCell({
  value,
  modified,
  onClick,
}: {
  value: string;
  modified: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group/cell inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-[var(--accent-subtle)]"
      style={{ color: 'var(--text-primary)' }}
    >
      {value}
      {modified && (
        <Pencil
          className="h-3 w-3 shrink-0"
          style={{ color: 'var(--accent)' }}
          aria-label="Modified by admin"
        />
      )}
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/cell:opacity-40" />
    </button>
  );
}

function BreakCell({
  outValue,
  inValue,
  duration,
  exceeded,
  modifiedOut,
  modifiedIn,
  onClickOut,
  onClickIn,
}: {
  outValue: string;
  inValue: string;
  duration: string;
  exceeded: boolean;
  modifiedOut: boolean;
  modifiedIn: boolean;
  onClickOut: () => void;
  onClickIn: () => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
        <button
          onClick={onClickOut}
          className="rounded px-1 transition-colors hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)]"
        >
          {outValue}
          {modifiedOut && (
            <Pencil
              className="ml-0.5 inline h-2.5 w-2.5"
              style={{ color: 'var(--accent)' }}
            />
          )}
        </button>
        <span>-</span>
        <button
          onClick={onClickIn}
          className="rounded px-1 transition-colors hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)]"
        >
          {inValue}
          {modifiedIn && (
            <Pencil
              className="ml-0.5 inline h-2.5 w-2.5"
              style={{ color: 'var(--accent)' }}
            />
          )}
        </button>
      </div>
      <span
        className={`text-xs font-medium ${
          exceeded
            ? 'rounded bg-red-500/10 px-1.5 py-0.5 text-red-400'
            : 'text-[var(--text-secondary)]'
        }`}
      >
        {duration}
        {exceeded && (
          <AlertTriangle className="ml-1 inline h-3 w-3 text-red-400" />
        )}
      </span>
    </div>
  );
}

/* ================================================== */
/*  TAB 3: Time History                                */
/* ================================================== */

function TimeHistoryTab() {
  const { data: employees, isLoading: empLoading } = useEmployeeList();

  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [empSearch, setEmpSearch] = useState('');

  const weekOptions = useMemo(() => generateWeekOptions(24), []);

  useEffect(() => {
    if (!selectedWeek && weekOptions.length > 0) {
      setSelectedWeek(weekOptions[0].value);
    }
  }, [weekOptions, selectedWeek]);

  const userId = selectedUserId !== 'all' ? parseInt(selectedUserId, 10) : undefined;
  const { data: entries, isLoading } = useTimeHistory(selectedWeek, userId);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    if (!empSearch) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(empSearch.toLowerCase())
    );
  }, [employees, empSearch]);

  function navigateWeek(direction: -1 | 1) {
    const idx = weekOptions.findIndex((w) => w.value === selectedWeek);
    const newIdx = idx - direction;
    if (newIdx >= 0 && newIdx < weekOptions.length) {
      setSelectedWeek(weekOptions[newIdx].value);
    }
  }

  // Compute total hours per entry
  function computeHours(e: TimeHistoryEntry): string {
    if (!e.clockIn || !e.clockOut) return '--';
    const inMs = new Date(e.clockIn).getTime();
    const outMs = new Date(e.clockOut).getTime();
    let lunchMs = 0;
    if (e.lunchOut && e.lunchIn) {
      lunchMs = new Date(e.lunchIn).getTime() - new Date(e.lunchOut).getTime();
    }
    const hours = (outMs - inMs - lunchMs) / (1000 * 3600);
    return Math.max(0, hours).toFixed(2);
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Selectors */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Employee selector */}
            <div className="min-w-[240px] flex-1 space-y-2">
              <Label>Employee</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <Input
                      placeholder="Search..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <SelectItem value="all">All Employees</SelectItem>
                  {empLoading && (
                    <div className="flex justify-center py-4">
                      <Loading size="sm" />
                    </div>
                  )}
                  {filteredEmployees.map((emp) => (
                    <SelectItem key={emp.userId} value={String(emp.userId)}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Week selector */}
            <div className="min-w-[280px] flex-1 space-y-2">
              <Label>Week</Label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => navigateWeek(-1)}
                  disabled={weekOptions.findIndex((w) => w.value === selectedWeek) >= weekOptions.length - 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select week..." />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => navigateWeek(1)}
                  disabled={weekOptions.findIndex((w) => w.value === selectedWeek) <= 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}

      {!isLoading && (!entries || entries.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <History className="mb-4 h-10 w-10" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              No time entries found for this week.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && entries && entries.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="px-3 py-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Employee</th>
                    <th className="px-3 py-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Date</th>
                    <th className="px-3 py-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Clock In</th>
                    <th className="px-3 py-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>1st Break</th>
                    <th className="px-3 py-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Lunch</th>
                    <th className="px-3 py-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>2nd Break</th>
                    <th className="px-3 py-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Clock Out</th>
                    <th className="px-3 py-3 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.timeLogId}
                      className="border-b last:border-b-0 transition-colors hover:bg-[var(--accent-subtle)]"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {entry.employeeName}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {formatTime(entry.clockIn)}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {entry.firstBreakOut ? `${formatTime(entry.firstBreakOut)} - ${formatTime(entry.firstBreakIn)}` : '--'}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {entry.lunchOut ? `${formatTime(entry.lunchOut)} - ${formatTime(entry.lunchIn)}` : '--'}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {entry.secondBreakOut ? `${formatTime(entry.secondBreakOut)} - ${formatTime(entry.secondBreakIn)}` : '--'}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {formatTime(entry.clockOut)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                        {computeHours(entry)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ================================================== */
/*  TAB 4: Audit Log                                   */
/* ================================================== */

function AuditLogTab() {
  const { data: employees, isLoading: empLoading } = useEmployeeList();

  // We fetch the audit data from a dedicated endpoint or re-use the timesheet.
  // For simplicity, we build a client-side filter approach:
  // user picks employee + week, we load the timesheet audits.
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [filterWeek, setFilterWeek] = useState<string>('');

  const weekOptions = useMemo(() => generateWeekOptions(12), []);

  useEffect(() => {
    if (!filterWeek && weekOptions.length > 0) {
      setFilterWeek(weekOptions[0].value);
    }
  }, [weekOptions, filterWeek]);

  // Load audits for each selected combination
  const userId = filterUserId ? parseInt(filterUserId, 10) : 0;
  const { data: timesheetData, isLoading: loading } = useEmployeeTimesheet(
    userId,
    filterWeek
  );

  const audits = timesheetData?.audits ?? [];

  return (
    <div className="space-y-6 pt-4">
      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[240px] flex-1 space-y-2">
              <Label>Employee</Label>
              <Select value={filterUserId} onValueChange={setFilterUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees?.map((emp) => (
                    <SelectItem
                      key={emp.userId}
                      value={String(emp.userId)}
                    >
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[280px] flex-1 space-y-2">
              <Label>Week</Label>
              <Select value={filterWeek} onValueChange={setFilterWeek}>
                <SelectTrigger>
                  <SelectValue placeholder="Select week..." />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prompt to select */}
      {!filterUserId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText
              className="mb-4 h-10 w-10"
              style={{ color: 'var(--text-muted)' }}
            />
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Select an employee to view their audit history.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {filterUserId && loading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}

      {/* Audit table */}
      {filterUserId && !loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {audits.length === 0 ? (
              <p
                className="py-8 text-center text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                No modifications found for the selected criteria.
              </p>
            ) : (
              <AuditTable audits={audits} showEmployee />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------- */
/*  Shared audit table                                 */
/* -------------------------------------------------- */

function AuditTable({
  audits,
  showEmployee,
}: {
  audits: Audit[];
  showEmployee: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b text-left text-xs font-medium uppercase tracking-wider"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <th className="pb-3 pr-3">Date</th>
            {showEmployee && <th className="pb-3 px-3">Employee</th>}
            <th className="pb-3 px-3">Field</th>
            <th className="pb-3 px-3">Old Value</th>
            <th className="pb-3 px-3">New Value</th>
            <th className="pb-3 px-3">Modified By</th>
            <th className="pb-3 pl-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {audits.map((audit) => (
            <tr
              key={audit.id}
              className="border-b transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <td
                className="py-3 pr-3"
                style={{ color: 'var(--text-primary)' }}
              >
                <div className="whitespace-nowrap">
                  {new Date(audit.date + 'T00:00:00').toLocaleDateString(
                    'en-US',
                    {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    }
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {new Date(audit.modifiedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </td>
              {showEmployee && (
                <td
                  className="px-3 py-3 font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {audit.employeeName}
                </td>
              )}
              <td className="px-3 py-3">
                <Badge variant="outline">{fieldLabel(audit.field)}</Badge>
              </td>
              <td className="px-3 py-3 text-[var(--text-secondary)]">
                {audit.oldValue ? formatTime(audit.oldValue) : '--:--'}
              </td>
              <td
                className="px-3 py-3 font-medium"
                style={{ color: 'var(--accent)' }}
              >
                {formatTime(audit.newValue)}
              </td>
              <td
                className="px-3 py-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                {audit.modifiedBy}
              </td>
              <td
                className="py-3 pl-3 max-w-[200px] truncate"
                style={{ color: 'var(--text-secondary)' }}
                title={audit.reason}
              >
                {audit.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
