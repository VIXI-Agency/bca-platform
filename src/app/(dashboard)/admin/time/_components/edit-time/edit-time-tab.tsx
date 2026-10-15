'use client';

import { useState, useEffect, useMemo } from 'react';
import { Clock, ClipboardList, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import {
  useEmployeeList,
  useEmployeeTimesheet,
  useEditTime,
  type DayLog,
} from '@/hooks/use-admin-time';
import { generateWeekOptions } from '../../_lib/pay-periods';
import { LockedPeriodNotice } from '../locked-period-notice';
import { AuditTable } from '../audit-table';
import { EditTimeSelectors } from './edit-time-selectors';
import { TimesheetTable } from './timesheet-table';
import { EditTimeDialog } from './edit-time-dialog';

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
      <EditTimeSelectors
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
        selectedWeek={selectedWeek}
        setSelectedWeek={setSelectedWeek}
        empSearch={empSearch}
        setEmpSearch={setEmpSearch}
        empLoading={empLoading}
        filteredEmployees={filteredEmployees}
        weekOptions={weekOptions}
        navigateWeek={navigateWeek}
      />

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
            <TimesheetTable dayLogs={dayLogs} openEditDialog={openEditDialog} />
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
      <EditTimeDialog
        editDialogOpen={editDialogOpen}
        setEditDialogOpen={setEditDialogOpen}
        selectedEmployeeName={selectedEmployeeName}
        editingDay={editingDay}
        editingField={editingField}
        editNewValue={editNewValue}
        setEditNewValue={setEditNewValue}
        editReason={editReason}
        setEditReason={setEditReason}
        editMutation={editMutation}
        handleEditSave={handleEditSave}
      />
    </div>
  );
}
