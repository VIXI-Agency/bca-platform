'use client';

import { AlertTriangle } from 'lucide-react';

/** Shown when the period's pay run is approved or paid: the server refuses
 *  edits to its hours, bonuses and disconnections until the run is voided. */
export function LockedPeriodNotice({ status }: { status: 'approved' | 'paid' | 'void' | null }) {
  if (status !== 'approved' && status !== 'paid') return null;
  return (
    <div className="no-print mb-3 flex items-center gap-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-subtle)] px-3 py-2 text-sm text-[var(--warning)]">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      This pay period is {status === 'paid' ? 'paid' : 'approved'} in Payroll and locked. Hours, bonuses and
      disconnections can&apos;t be changed unless the pay run is voided.
    </div>
  );
}
