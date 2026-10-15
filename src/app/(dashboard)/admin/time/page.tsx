'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Clock,
  Pencil,
  Users,
  ClipboardList,
  FileText,
  ChevronLeft,
  ChevronRight,
  History,
  DollarSign,
  Printer,
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
  useEmployeeList,
  useEmployeeTimesheet,
  useEditTime,
  useDisconnections,
  useUpdatePayRate,
  useBonus,
  useSaveBonus,
  BONUS_FIELDS,
  type BonusFieldKey,
  type DayLog,
  type DisconnectionType,
} from '@/hooks/use-admin-time';
import { generateWeekOptions } from './_lib/pay-periods';
import { formatTime, breakMinutes, formatDuration } from './_lib/format';
import { fieldLabel, DISCONNECTION_TYPE_LABELS } from './_lib/constants';
import { LockedPeriodNotice } from './_components/locked-period-notice';
import { TimeCell, BreakCell } from './_components/time-cells';
import { AuditTable } from './_components/audit-table';
import { EmployeeStatusTab } from './_components/employee-status-tab';
import { TimeHistoryTab } from './_components/time-history-tab';

/* -------------------------------------------------- */
/*  Sub-components                                     */
/* -------------------------------------------------- */

/* -------------------------------------------------- */
/*  Main Page                                          */
/* -------------------------------------------------- */

export default function AdminTimePage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;

  // Guard: Administrator only — Time Management (hours, pay rates, the
  // Payment Report) is no longer open to Closers.
  if (userRole !== 1) {
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
            <TabsTrigger value="report" className="gap-1.5">
              <DollarSign className="h-4 w-4" />
              Payment Report
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

          <TabsContent value="report">
            <PaymentReportTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
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

/* ================================================== */
/*  TAB 5: Payment Report                              */
/* ================================================== */

const BONUS_FIELD_LABELS: Record<BonusFieldKey, string> = {
  discretionaryBonus: 'Discretionary Bonus',
  collectionsBonus: 'Collections Bonus',
  trainingBonus: 'Training Bonus',
  managerBonus: 'Manager Bonus',
  wheelSpins: 'Wheel Spins',
  accounts: 'Accounts',
  reloads: 'Reloads',
  verifiedLeads: 'Verified Leads',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function PaymentReportTab() {
  const { data: employees, isLoading: empLoading } = useEmployeeList();
  const updatePayRate = useUpdatePayRate();
  const saveBonus = useSaveBonus();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [empSearch, setEmpSearch] = useState('');
  const [payRateInput, setPayRateInput] = useState('');
  const [otPayRateInput, setOtPayRateInput] = useState('');
  const [bonusInputs, setBonusInputs] = useState<Record<BonusFieldKey, string>>(
    () => Object.fromEntries(BONUS_FIELDS.map((key) => [key, ''])) as Record<BonusFieldKey, string>,
  );

  const weekOptions = useMemo(() => generateWeekOptions(24), []);

  useEffect(() => {
    if (!selectedWeek && weekOptions.length > 0) {
      setSelectedWeek(weekOptions[0].value);
    }
  }, [weekOptions, selectedWeek]);

  const userId = selectedUserId ? parseInt(selectedUserId, 10) : 0;
  const { data: timesheet, isLoading: timesheetLoading } = useEmployeeTimesheet(userId, selectedWeek);
  const { data: disconnections, isLoading: disconnectionsLoading } = useDisconnections(userId, selectedWeek);
  const { data: bonus, isLoading: bonusLoading } = useBonus(userId, selectedWeek);

  const employee = useMemo(
    () => employees?.find((e) => e.userId === userId),
    [employees, userId],
  );

  // Seed the rate inputs from the employee's saved rate whenever the
  // selected employee changes (not on every render — the admin may be
  // actively typing a correction).
  useEffect(() => {
    setPayRateInput(employee?.payRate != null ? String(employee.payRate) : '');
    setOtPayRateInput(employee?.otPayRate != null ? String(employee.otPayRate) : '');
  }, [employee?.userId, employee?.payRate, employee?.otPayRate]);

  // Bonus categories are scoped per employee + pay period (not a standing
  // rate), so they re-seed whenever either changes, from whatever's saved
  // for that period.
  useEffect(() => {
    setBonusInputs(
      Object.fromEntries(
        BONUS_FIELDS.map((key) => [key, bonus?.[key] != null ? String(bonus[key]) : '']),
      ) as Record<BonusFieldKey, string>,
    );
  }, [userId, selectedWeek, bonus]);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    if (!empSearch) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(empSearch.toLowerCase()));
  }, [employees, empSearch]);

  function navigateWeek(direction: -1 | 1) {
    const idx = weekOptions.findIndex((w) => w.value === selectedWeek);
    const newIdx = idx - direction;
    if (newIdx >= 0 && newIdx < weekOptions.length) {
      setSelectedWeek(weekOptions[newIdx].value);
    }
  }

  const isLoading = timesheetLoading || disconnectionsLoading;
  const dayLogs = timesheet?.data ?? [];
  const totals = timesheet?.weekTotals;

  // The rate used for the live calculation and for print comes from what's
  // currently typed, not from the saved record — so the total updates as
  // the admin types, before (or instead of) saving it.
  const parsedPayRate = payRateInput.trim() ? Number(payRateInput) : null;
  const parsedOtPayRate = otPayRateInput.trim() ? Number(otPayRateInput) : null;
  const payRate = parsedPayRate != null && !isNaN(parsedPayRate) && parsedPayRate >= 0 ? parsedPayRate : null;
  const otPayRate = parsedOtPayRate != null && !isNaN(parsedOtPayRate) && parsedOtPayRate >= 0 ? parsedOtPayRate : null;
  // Same math and rounding as computePayStatement on the server, so the PDF
  // matches what Payroll will snapshot on approval: each component rounded
  // to cents, and overtime with no OT rate paid as $0 (flagged below) rather
  // than hiding the whole summary.
  const cents = (n: number) => Math.round(n * 100) / 100;
  const regularPay = payRate != null && totals ? cents(totals.totalHours * payRate) : null;
  const hasOvertime = (totals?.overtime ?? 0) > 0;
  const otRateMissing = hasOvertime && otPayRate == null;
  const otPay = totals ? (hasOvertime && otPayRate != null ? cents(totals.overtime * otPayRate) : 0) : null;
  // Bonus/incentive categories: manually-entered dollar amounts, not computed
  // from any formula — kept separate from the hourly/OT math and summed in.
  const bonusAmounts = Object.fromEntries(
    BONUS_FIELDS.map((key) => {
      const raw = bonusInputs[key].trim() ? Number(bonusInputs[key]) : null;
      return [key, raw != null && !isNaN(raw) && raw >= 0 ? raw : 0];
    }),
  ) as Record<BonusFieldKey, number>;
  const bonusTotal = cents(BONUS_FIELDS.reduce((sum, key) => sum + bonusAmounts[key], 0));
  const totalPay = regularPay != null && otPay != null ? cents(regularPay + otPay + bonusTotal) : null;
  const periodLabel = weekOptions.find((w) => w.value === selectedWeek)?.label ?? '';

  const rateIsDirty =
    employee != null &&
    (payRate !== (employee.payRate ?? null) || otPayRate !== (employee.otPayRate ?? null));
  const bonusIsDirty = BONUS_FIELDS.some((key) => bonusAmounts[key] !== (bonus?.[key] ?? 0));

  // Errors (e.g. a locked period) are shown next to each Save button from the
  // mutation's own error state.
  async function handleSaveRate() {
    if (!employee) return;
    try {
      // null clears a rate the admin emptied; undefined would be dropped
      // from the request and leave the old rate in place.
      await updatePayRate.mutateAsync({ userId: employee.userId, payRate, otPayRate });
    } catch {
      /* shown from updatePayRate.error */
    }
  }

  async function handleSaveBonus() {
    if (!userId || !selectedWeek) return;
    try {
      await saveBonus.mutateAsync({ userId, week: selectedWeek, ...bonusAmounts });
    } catch {
      /* shown from saveBonus.error */
    }
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Selectors */}
      <Card className="no-print">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-4">
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
                    <SelectItem key={emp.userId} value={String(emp.userId)}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[280px] flex-1 space-y-2">
              <Label>Pay Period</Label>
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
                    <SelectValue placeholder="Select period..." />
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

            {selectedUserId && (
              <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
                <Printer className="h-4 w-4" />
                Print / Save as PDF
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedUserId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <DollarSign className="mb-4 h-10 w-10" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Select an employee and pay period to generate a payment report.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedUserId && isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}

      {selectedUserId && !isLoading && timesheet && (
        <div className="print-area space-y-6 print:space-y-2">
          {/* Letterhead: print only */}
          <div className="print-only mb-2 flex items-center justify-between border-b-2 pb-3 print:mb-1 print:pb-1" style={{ borderColor: 'var(--text-primary)' }}>
            <div>
              <p className="text-xl font-bold tracking-tight print:text-[15px]" style={{ color: 'var(--text-primary)' }}>
                Pulse<span style={{ color: 'var(--accent)' }}>BC</span>
              </p>
              <p className="text-xs print:text-[8px]" style={{ color: 'var(--text-secondary)' }}>Benjamin Chaise &amp; Associates</p>
            </div>
            <p className="text-xs uppercase tracking-widest print:text-[8px]" style={{ color: 'var(--text-muted)' }}>Payment Report</p>
          </div>

          <Card>
            <CardContent className="space-y-6 py-6 print:space-y-2 print:py-2">
              <LockedPeriodNotice status={timesheet.payRunStatus} />
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4 print:gap-2 print:pb-1" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <h2 className="text-lg font-bold print:text-[13px]" style={{ color: 'var(--text-primary)' }}>
                    {employee?.name}
                  </h2>
                  <p className="text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
                    {employee?.email}
                  </p>
                  {employee?.isPartTime && <Badge variant="warning" className="mt-1 print:text-[7.5px]">Part-time</Badge>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold print:text-[10px]" style={{ color: 'var(--text-primary)' }}>
                    Pay Period
                  </p>
                  <p className="text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>{periodLabel}</p>
                  {payRate != null && (
                    <p className="print-only mt-1 text-xs print:text-[8.5px]" style={{ color: 'var(--text-muted)' }}>
                      Rate: {formatCurrency(payRate)}/hr
                      {otPayRate != null && ` · OT: ${formatCurrency(otPayRate)}/hr`}
                    </p>
                  )}
                  {/* Printing with a typed-but-unsaved rate produces totals that
                      Payroll will never use — say so on the page itself. */}
                  {rateIsDirty && (
                    <p className="print-only mt-1 text-xs font-semibold text-red-600 print:text-[8.5px]">
                      DRAFT — pay rate not saved
                    </p>
                  )}
                </div>
              </div>

              {/* Rate editor — typing here recalculates the totals below
                  immediately; Save persists it to the employee's profile. */}
              <div
                className="no-print flex flex-wrap items-end gap-3 rounded-lg border p-3"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="space-y-1">
                  <Label htmlFor="report-pay-rate" className="text-xs">Pay Rate ($/hr)</Label>
                  <Input
                    id="report-pay-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-8 w-28"
                    value={payRateInput}
                    onChange={(e) => setPayRateInput(e.target.value)}
                    placeholder="8.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="report-ot-rate" className="text-xs">OT Rate ($/hr)</Label>
                  <Input
                    id="report-ot-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-8 w-28"
                    value={otPayRateInput}
                    onChange={(e) => setOtPayRateInput(e.target.value)}
                    placeholder="12.00"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveRate}
                  disabled={!rateIsDirty || updatePayRate.isPending}
                >
                  {updatePayRate.isPending ? (
                    <Loading size="sm" />
                  ) : rateIsDirty ? (
                    'Save Rate'
                  ) : (
                    'Saved'
                  )}
                </Button>
                {payRate == null && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Enter a rate to calculate payment for this period.
                  </p>
                )}
                {updatePayRate.error && (
                  <p className="w-full text-xs text-red-500">{updatePayRate.error.message}</p>
                )}
              </div>

              {/* Bonus/incentive categories — manual per-period amounts, separate
                  from the hourly rate, added straight into the total below and
                  shown as their own line items on the printed report. */}
              <div
                className="no-print space-y-3 rounded-lg border p-3"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-xs">Bonuses &amp; Incentives (optional, per pay period)</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveBonus}
                    disabled={!bonusIsDirty || saveBonus.isPending || bonusLoading}
                  >
                    {saveBonus.isPending ? (
                      <Loading size="sm" />
                    ) : bonusIsDirty ? (
                      'Save Bonuses'
                    ) : (
                      'Saved'
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {BONUS_FIELDS.map((key) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`report-bonus-${key}`} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {BONUS_FIELD_LABELS[key]}
                      </Label>
                      <Input
                        id={`report-bonus-${key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-8"
                        value={bonusInputs[key]}
                        onChange={(e) => setBonusInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder="0.00"
                        disabled={bonusLoading}
                      />
                    </div>
                  ))}
                </div>
                {saveBonus.error && <p className="text-xs text-red-500">{saveBonus.error.message}</p>}
              </div>

              {/* Timesheet table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm print:text-[9px]">
                  <thead>
                    <tr
                      className="border-b text-left text-xs font-medium uppercase tracking-wider print:text-[7.5px]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      <th className="pb-2 pr-3 print:pb-[3px] print:pr-[6px]">Day</th>
                      <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">Clock In</th>
                      <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">1st Break</th>
                      <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">Lunch</th>
                      <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">2nd Break</th>
                      <th className="pb-2 px-3 print:pb-[3px] print:px-[6px]">Clock Out</th>
                      <th className="pb-2 px-3 text-right print:pb-[3px] print:px-[6px]">Total</th>
                      <th className="pb-2 pl-3 text-right print:pb-[3px] print:pl-[6px]">OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayLogs.map((day) => {
                      const dayDate = new Date(day.date + 'T00:00:00');
                      const dayLabel = `${dayDate.toLocaleDateString('en-US', { weekday: 'short' })} ${dayDate.getMonth() + 1}/${dayDate.getDate()}`;
                      const wasModified = day.isModifiedByAdmin || (day.modifiedFields?.length ?? 0) > 0;
                      return (
                        <tr key={day.date} className="border-b" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-2 pr-3 font-medium print:py-[3px] print:pr-[6px]" style={{ color: 'var(--text-primary)' }}>
                            <span className="inline-flex items-center gap-1.5">
                              {dayLabel}
                              {wasModified && (
                                <Pencil
                                  className="h-3 w-3 shrink-0 print:h-[7px] print:w-[7px]"
                                  style={{ color: 'var(--accent)' }}
                                  aria-label="Modified by admin"
                                />
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>{formatTime(day.clockIn)}</td>
                          <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>
                            {day.firstBreakOut ? `${formatTime(day.firstBreakOut)} - ${formatTime(day.firstBreakIn)}` : '--'}
                          </td>
                          <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>
                            {day.lunchOut ? `${formatTime(day.lunchOut)} - ${formatTime(day.lunchIn)}` : '--'}
                          </td>
                          <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>
                            {day.secondBreakOut ? `${formatTime(day.secondBreakOut)} - ${formatTime(day.secondBreakIn)}` : '--'}
                          </td>
                          <td className="px-3 py-2 print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-secondary)' }}>{formatTime(day.clockOut)}</td>
                          <td className="px-3 py-2 text-right font-medium print:px-[6px] print:py-[3px]" style={{ color: 'var(--text-primary)' }}>
                            {day.totalHours != null ? formatDuration(Math.round(day.totalHours * 60)) : '--'}
                            {(day.disconnectedMinutes ?? 0) > 0 && (
                              <span className="block text-xs font-normal text-red-500 print:text-[7px]">
                                −{formatDuration(Math.round(day.disconnectedMinutes ?? 0))} disc.
                              </span>
                            )}
                          </td>
                          <td className="pl-3 py-2 text-right print:pl-[6px] print:py-[3px]" style={{ color: day.overtime ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {day.overtime ? formatDuration(Math.round(day.overtime * 60)) : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr className="border-t-2" style={{ borderColor: 'var(--border)' }}>
                        <td colSpan={6} className="py-2 text-right text-sm font-semibold print:py-[4px] print:text-[9px]" style={{ color: 'var(--text-primary)' }}>
                          Totals
                        </td>
                        <td className="py-2 px-3 text-right text-sm font-bold print:py-[4px] print:px-[6px] print:text-[9px]" style={{ color: 'var(--text-primary)' }}>
                          {formatDuration(Math.round(totals.totalHours * 60))}
                        </td>
                        <td className="py-2 pl-3 text-right text-sm font-bold print:py-[4px] print:pl-[6px] print:text-[9px]" style={{ color: 'var(--accent)' }}>
                          {formatDuration(Math.round(totals.overtime * 60))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Disconnections summary */}
              {disconnections && disconnections.data.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold print:mb-1 print:text-[10px]" style={{ color: 'var(--text-primary)' }}>
                    Disconnections
                    {(totals?.disconnectedMinutes ?? 0) > 0 && (
                      <span className="ml-2 font-normal text-red-500">
                        ({formatDuration(Math.round(totals?.disconnectedMinutes ?? 0))} deducted from paid hours)
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2 print:gap-1">
                    {(Object.keys(DISCONNECTION_TYPE_LABELS) as DisconnectionType[])
                      .filter((type) => disconnections.counts[type] > 0)
                      .map((type) => (
                        <Badge key={type} variant="outline" className="print:px-[5px] print:py-0 print:text-[7.5px]">
                          {DISCONNECTION_TYPE_LABELS[type]}: {disconnections.counts[type]}
                        </Badge>
                      ))}
                  </div>
                  <div className="mt-3 space-y-1 print:mt-1 print:space-y-0">
                    {disconnections.data.map((d) => (
                      <p key={d.id} className="text-xs print:text-[8px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' · '}
                        {formatTime(d.startTime)} – {d.endTime ? formatTime(d.endTime) : 'not reconnected (until clock-out)'}
                        {d.durationMinutes != null && ` (${formatDuration(d.durationMinutes)})`}
                        {' — '}
                        {DISCONNECTION_TYPE_LABELS[d.type]}
                        {d.reason && `: ${d.reason}`}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Modifications: every manual edit behind this period's numbers, so the
                  report doesn't silently hide an adjustment or a missing reason. */}
              {timesheet.audits.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold print:mb-1 print:text-[10px]" style={{ color: 'var(--text-primary)' }}>
                    Modifications This Period
                  </p>
                  <AuditTable audits={timesheet.audits} showEmployee={false} />
                </div>
              )}

              {/* Payment summary */}
              {totalPay != null && (
                <div className="space-y-1 border-t pt-4 print:space-y-0 print:pt-[6px]" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
                    <span>Regular ({formatDuration(Math.round((totals?.totalHours ?? 0) * 60))} × {formatCurrency(payRate!)})</span>
                    <span>{formatCurrency(regularPay!)}</span>
                  </div>
                  {otPay! > 0 && (
                    <div className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
                      <span>Overtime ({formatDuration(Math.round((totals?.overtime ?? 0) * 60))} × {formatCurrency(otPayRate!)})</span>
                      <span>{formatCurrency(otPay!)}</span>
                    </div>
                  )}
                  {otRateMissing && (
                    <div className="flex justify-between text-sm text-red-500 print:text-[9.5px]">
                      <span>Overtime ({formatDuration(Math.round((totals?.overtime ?? 0) * 60))}) — not paid: no OT rate set</span>
                      <span>{formatCurrency(0)}</span>
                    </div>
                  )}
                  {BONUS_FIELDS.filter((key) => bonusAmounts[key] > 0).map((key) => (
                    <div key={key} className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
                      <span>{BONUS_FIELD_LABELS[key]}</span>
                      <span>{formatCurrency(bonusAmounts[key])}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-base font-bold print:pt-[3px] print:text-[11px]" style={{ color: 'var(--text-primary)' }}>
                    <span>Total Payment</span>
                    <span>{formatCurrency(totalPay)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
