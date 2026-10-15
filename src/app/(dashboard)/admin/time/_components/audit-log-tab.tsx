'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmployeeList, useEmployeeTimesheet, usePeriodAudits } from '@/hooks/use-admin-time';
import { payPeriodOptions } from '@/lib/time';
import { AuditTable } from './audit-table';

/* ================================================== */
/*  TAB 4: Audit Log                                   */
/* ================================================== */

export function AuditLogTab() {
  const { data: employees } = useEmployeeList();

  // We fetch the audit data from a dedicated endpoint or re-use the timesheet.
  // For simplicity, we build a client-side filter approach:
  // user picks employee + week, we load the timesheet audits.
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [filterWeek, setFilterWeek] = useState<string>('');

  const weekOptions = useMemo(() => payPeriodOptions(12), []);

  useEffect(() => {
    if (!filterWeek && weekOptions.length > 0) {
      setFilterWeek(weekOptions[0].value);
    }
  }, [weekOptions, filterWeek]);

  // One employee's audits come with their timesheet; "All Employees" has its
  // own endpoint (parseInt('all') used to disable the query and always show
  // "No modifications found").
  const isAll = filterUserId === 'all';
  const userId = filterUserId && !isAll ? parseInt(filterUserId, 10) : 0;
  const { data: timesheetData, isLoading: timesheetLoading } = useEmployeeTimesheet(
    userId,
    filterWeek
  );
  const { data: periodAudits, isLoading: periodLoading } = usePeriodAudits(filterWeek, isAll);

  const loading = isAll ? periodLoading : timesheetLoading;
  const audits = (isAll ? periodAudits : timesheetData?.audits) ?? [];

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
