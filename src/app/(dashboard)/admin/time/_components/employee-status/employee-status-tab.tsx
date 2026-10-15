'use client';

import { useState, useMemo } from 'react';
import { Search, Users, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useEmployeeStatuses,
  useDisconnectEmployee,
  type EmployeeStatus,
  type DisconnectionType,
} from '@/hooks/use-admin-time';
import { STATUS_CONFIG } from '../../_lib/constants';
import { StatusSummary } from './status-summary';
import { EmployeeStatusTable } from './employee-status-table';
import { DisconnectDialog } from './disconnect-dialog';

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
      <StatusSummary summary={summary} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />

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
        <EmployeeStatusTable filtered={filtered} openDisconnectDialog={openDisconnectDialog} />
      )}

      {/* Disconnect / Reconnect Dialog */}
      <DisconnectDialog
        disconnectTarget={disconnectTarget}
        setDisconnectTarget={setDisconnectTarget}
        disconnectAction={disconnectAction}
        disconnectType={disconnectType}
        setDisconnectType={setDisconnectType}
        disconnectReason={disconnectReason}
        setDisconnectReason={setDisconnectReason}
        disconnectMutation={disconnectMutation}
        handleDisconnect={handleDisconnect}
      />
    </div>
  );
}
