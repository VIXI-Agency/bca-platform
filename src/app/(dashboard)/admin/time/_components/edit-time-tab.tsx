'use client';

import { useState, useEffect, useMemo } from 'react';
import { Clock, ClipboardList, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  useEmployeeList,
  useEmployeeTimesheet,
  useEditTime,
  type DayLog,
} from '@/hooks/use-admin-time';
import { generateWeekOptions } from '../_lib/pay-periods';
import { formatTime, breakMinutes, formatDuration } from '../_lib/format';
import { fieldLabel } from '../_lib/constants';
import { LockedPeriodNotice } from './locked-period-notice';
import { TimeCell, BreakCell } from './time-cells';
import { AuditTable } from './audit-table';

/* ================================================== */
/*  TAB 2: Edit Time                                   */
/* ================================================== */

export function EditTimeTab() {
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
    editMutation.reset();
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
    // An empty value is allowed — it clears the entry (e.g. a skipped break/lunch).
    // The reason is mandatory and has to be an actual explanation (min 8
    // chars) — a bare "0" used to pass and made the audit trail useless.
    if (!editingDay || editReason.trim().length < 8) return;
    try {
      await editMutation.mutateAsync({
        userId: parseInt(selectedUserId, 10),
        date: editingDay.date,
        field: editingField,
        value: editNewValue.trim(),
        reason: editReason.trim(),
      });
      setEditDialogOpen(false);
    } catch {
      /* the dialog stays open and shows editMutation.error (e.g. a locked period) */
    }
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
            <LockedPeriodNotice status={timesheetData?.payRunStatus ?? null} />
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
                          {(day.overtime ?? 0) > 0 && (
                            <span className="block text-xs font-normal" style={{ color: 'var(--accent)' }}>
                              +{formatDuration(Math.round((day.overtime ?? 0) * 60))} OT
                            </span>
                          )}
                          {(day.disconnectedMinutes ?? 0) > 0 && (
                            <span className="block text-xs font-normal text-red-500">
                              −{formatDuration(Math.round(day.disconnectedMinutes ?? 0))} disconnected
                            </span>
                          )}
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
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-new-value">New Time (HH:mm)</Label>
                {editNewValue.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setEditNewValue('')}
                    className="text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                  >
                    Clear (no entry)
                  </button>
                )}
              </div>
              <Input
                id="edit-new-value"
                type="time"
                value={editNewValue}
                onChange={(e) => setEditNewValue(e.target.value)}
              />
              <p className="text-xs text-[var(--text-muted)]">
                Leave blank to clear this entry — e.g. a break or lunch the
                employee didn&apos;t take.
              </p>
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
                placeholder="Explain why this time is being changed... (e.g. employee forgot to clock in)"
                className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
              />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                At least 8 characters — this shows up on the employee&apos;s Payment Report.
              </p>
            </div>
            {editMutation.error && (
              <p className="text-sm text-red-500">{editMutation.error.message}</p>
            )}
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
              disabled={editReason.trim().length < 8 || editMutation.isPending}
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
