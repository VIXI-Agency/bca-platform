'use client';

import type { EmployeeStatus } from '@/hooks/use-admin-time';
import { STATUS_CONFIG } from '../_lib/constants';

export function StatusBadge({ status }: { status: EmployeeStatus['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_clocked_in;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}
