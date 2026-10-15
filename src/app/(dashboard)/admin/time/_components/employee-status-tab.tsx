'use client';

import { useState, useMemo } from 'react';
import { Clock, Search, Wifi, WifiOff, Users, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
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
import {
  useEmployeeStatuses,
  useDisconnectEmployee,
  type EmployeeStatus,
  type DisconnectionType,
} from '@/hooks/use-admin-time';
import { formatTime } from '../_lib/format';
import { STATUS_CONFIG, DISCONNECTION_TYPE_OPTIONS } from '../_lib/constants';
import { StatusBadge } from './status-badge';
import { LiveTimer } from './live-timer';

/* ================================================== */
/*  TAB 1: Employee Status                             */
/* ================================================== */

export function EmployeeStatusTab() {
  const { data: statuses, isLoading, dataUpdatedAt } = useEmployeeStatuses();
  const disconnectMutation = useDisconnectEmployee();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Disconnect dialog
  const [disconnectTarget, setDisconnectTarget] =
    useState<EmployeeStatus | null>(null);
  const [disconnectReason, setDisconnectReason] = useState('');
  const [disconnectType, setDisconnectType] = useState<DisconnectionType | ''>('');
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
    disconnectMutation.reset();
    setDisconnectTarget(emp);
    setDisconnectAction(action);
    setDisconnectReason('');
    setDisconnectType('');
  }

  async function handleDisconnect() {
    if (!disconnectTarget) return;
    try {
      await disconnectMutation.mutateAsync({
        userId: disconnectTarget.userId,
        action: disconnectAction,
        type: disconnectAction === 'disconnect' && disconnectType ? disconnectType : undefined,
        reason: disconnectReason || undefined,
      });
      setDisconnectTarget(null);
      setDisconnectReason('');
      setDisconnectType('');
    } catch {
      /* the dialog stays open and shows disconnectMutation.error */
    }
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
            {disconnectAction === 'disconnect' && (
              <div className="space-y-2">
                <Label htmlFor="disconnect-type">Category</Label>
                <Select
                  value={disconnectType}
                  onValueChange={(v) => setDisconnectType(v as DisconnectionType)}
                >
                  <SelectTrigger id="disconnect-type">
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCONNECTION_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
            {disconnectMutation.error && (
              <p className="text-sm text-red-500">{disconnectMutation.error.message}</p>
            )}
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
