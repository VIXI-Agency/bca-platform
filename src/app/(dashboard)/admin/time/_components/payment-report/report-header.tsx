'use client';

import { Badge } from '@/components/ui/badge';
import type { Employee } from '@/hooks/use-admin-time';
import { formatCurrency } from './labels';

/** Company letterhead, shown only on the printed report. */
export function ReportLetterhead() {
  return (
    <div className="print-only mb-2 flex items-center justify-between border-b-2 pb-3 print:mb-1 print:pb-1" style={{ borderColor: 'var(--text-primary)' }}>
      <div>
        <p className="text-xl font-bold tracking-tight print:text-[15px]" style={{ color: 'var(--text-primary)' }}>
          Pulse<span style={{ color: 'var(--accent)' }}>BC</span>
        </p>
        <p className="text-xs print:text-[8px]" style={{ color: 'var(--text-secondary)' }}>Benjamin Chaise &amp; Associates</p>
      </div>
      <p className="text-xs uppercase tracking-widest print:text-[8px]" style={{ color: 'var(--text-muted)' }}>Payment Report</p>
    </div>
  );
}

interface EmployeeHeaderProps {
  employee: Employee | undefined;
  periodLabel: string;
  payRate: number | null;
  otPayRate: number | null;
  rateIsDirty: boolean;
}

/** Employee name, email and pay period; on print, also the rate used. */
export function EmployeeHeader({ employee, periodLabel, payRate, otPayRate, rateIsDirty }: EmployeeHeaderProps) {
  return (
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
  );
}
