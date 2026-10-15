'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
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
import { useEmployeeList, useTimeHistory, type TimeHistoryEntry } from '@/hooks/use-admin-time';
import { payPeriodOptions } from '@/lib/time';
import { formatTime, formatDuration } from '../_lib/format';

/* ================================================== */
/*  TAB 3: Time History                                */
/* ================================================== */

export function TimeHistoryTab() {
  const { data: employees, isLoading: empLoading } = useEmployeeList();

  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [empSearch, setEmpSearch] = useState('');

  const weekOptions = useMemo(() => payPeriodOptions(24), []);

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

  // Paid hours come from the server's shared payroll math (lunch and
  // disconnected time already deducted), so this tab matches the Payment Report.
  function computeHours(e: TimeHistoryEntry): string {
    return e.paidHours == null ? '--' : e.paidHours.toFixed(2);
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
                        {entry.disconnectedMinutes > 0 && (
                          <span className="block text-xs font-normal text-red-500">
                            −{formatDuration(Math.round(entry.disconnectedMinutes))} disconnected
                          </span>
                        )}
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
