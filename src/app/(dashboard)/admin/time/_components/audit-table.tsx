'use client';

import { Badge } from '@/components/ui/badge';
import type { Audit } from '@/hooks/use-admin-time';
import { fieldLabel } from '../_lib/constants';
import { formatTime, formatSpan } from '../_lib/format';

/* -------------------------------------------------- */
/*  Shared audit table                                 */
/* -------------------------------------------------- */

export function AuditTable({
  audits,
  showEmployee,
}: {
  audits: Audit[];
  showEmployee: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm print:text-[8.5px] print:leading-tight">
        <thead>
          <tr
            className="border-b text-left text-xs font-medium uppercase tracking-wider print:text-[7.5px]"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <th className="pb-3 pr-3 print:pb-[2px] print:pr-[6px]">Date</th>
            {showEmployee && <th className="pb-3 px-3 print:pb-[2px] print:px-[6px]">Employee</th>}
            <th className="pb-3 px-3 print:pb-[2px] print:px-[6px]">Field</th>
            <th className="pb-3 px-3 print:pb-[2px] print:px-[6px]">Old Value</th>
            <th className="pb-3 px-3 print:pb-[2px] print:px-[6px]">New Value</th>
            <th className="pb-3 px-3 print:pb-[2px] print:px-[6px]">Modified By</th>
            <th className="pb-3 pl-3 print:pb-[2px] print:pl-[6px]">Reason</th>
          </tr>
        </thead>
        <tbody>
          {audits.map((audit) => (
            <tr
              key={`${audit.kind ?? 'time'}-${audit.id}`}
              className="border-b transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <td
                className="py-3 pr-3 print:py-[2px] print:pr-[6px]"
                style={{ color: 'var(--text-primary)' }}
              >
                <div className="whitespace-nowrap">
                  {new Date(audit.date + 'T00:00:00').toLocaleDateString(
                    'en-US',
                    {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    }
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] print:hidden">
                  {new Date(audit.modifiedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </td>
              {showEmployee && (
                <td
                  className="px-3 py-3 font-medium print:px-[6px] print:py-[2px]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {audit.employeeName}
                </td>
              )}
              <td className="px-3 py-3 print:px-[6px] print:py-[2px]">
                <Badge variant="outline" className="print:px-[5px] print:py-0 print:text-[7.5px] print:leading-none">{fieldLabel(audit.field)}</Badge>
                {audit.disconnection && (
                  <div className="mt-0.5 whitespace-nowrap text-xs text-[var(--text-muted)] print:mt-0 print:text-[7px]">
                    for{' '}
                    {new Date(audit.disconnection.day + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'numeric',
                      day: 'numeric',
                    })}
                  </div>
                )}
              </td>
              <td className="px-3 py-3 text-[var(--text-secondary)] print:px-[6px] print:py-[2px]">
                {audit.disconnection
                  ? formatSpan(audit.disconnection.before)
                  : audit.oldValue ? formatTime(audit.oldValue) : '--:--'}
              </td>
              <td
                className="px-3 py-3 font-medium print:px-[6px] print:py-[2px]"
                style={{ color: 'var(--accent)' }}
              >
                {audit.disconnection
                  ? audit.disconnection.after ? formatSpan(audit.disconnection.after) : 'Removed'
                  : formatTime(audit.newValue)}
              </td>
              <td
                className="px-3 py-3 print:px-[6px] print:py-[2px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {audit.modifiedBy}
              </td>
              <td
                className="py-3 pl-3 max-w-[200px] truncate print:py-[2px] print:pl-[6px]"
                style={{ color: audit.reason.trim().length < 8 ? 'var(--danger)' : 'var(--text-secondary)' }}
                title={audit.reason.trim().length < 8 ? `No real reason given: "${audit.reason}"` : audit.reason}
              >
                {audit.reason.trim().length < 8 ? `⚠ "${audit.reason}" (no real reason given)` : audit.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
