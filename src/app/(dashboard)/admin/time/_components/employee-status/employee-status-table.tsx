'use client';

import { Clock, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { EmployeeStatus } from '@/hooks/use-admin-time';
import { formatTime } from '../../_lib/format';
import { StatusBadge } from '../status-badge';
import { LiveTimer } from '../live-timer';

interface EmployeeStatusTableProps {
  filtered: EmployeeStatus[];
  openDisconnectDialog: (emp: EmployeeStatus, action: 'disconnect' | 'reconnect') => void;
}

/** One card per employee: today's times, live break timer, disconnect/reconnect. */
export function EmployeeStatusTable({ filtered, openDisconnectDialog }: EmployeeStatusTableProps) {
  return (
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
  );
}
