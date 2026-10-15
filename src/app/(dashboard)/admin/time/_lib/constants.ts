import type { EmployeeStatus, DisconnectionType } from '@/hooks/use-admin-time';

export const STATUS_CONFIG: Record<
  EmployeeStatus['status'],
  { label: string; color: string; bg: string }
> = {
  working: {
    label: 'Working',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.1)',
  },
  on_break: {
    label: 'On Break',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.1)',
  },
  at_lunch: {
    label: 'At Lunch',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.1)',
  },
  not_clocked_in: {
    label: 'Not Clocked In',
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.1)',
  },
  clocked_out: {
    label: 'Clocked Out',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
};

export const EDITABLE_FIELDS: { key: string; label: string }[] = [
  { key: 'clockIn', label: 'Clock In' },
  { key: 'firstBreakOut', label: '1st Break Out' },
  { key: 'firstBreakIn', label: '1st Break In' },
  { key: 'lunchOut', label: 'Lunch Out' },
  { key: 'lunchIn', label: 'Lunch In' },
  { key: 'secondBreakOut', label: '2nd Break Out' },
  { key: 'secondBreakIn', label: '2nd Break In' },
  { key: 'clockOut', label: 'Clock Out' },
];

export function fieldLabel(key: string): string {
  return EDITABLE_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export const DISCONNECTION_TYPE_OPTIONS: { value: DisconnectionType; label: string }[] = [
  { value: 'absence', label: 'Absence' },
  { value: 'early_leave', label: 'Early Leave' },
  { value: 'power_outage', label: 'Power Outage' },
  { value: 'internet_outage', label: 'Internet Outage' },
  { value: 'other', label: 'Other' },
];

export const DISCONNECTION_TYPE_LABELS: Record<DisconnectionType, string> = {
  absence: 'Absences',
  early_leave: 'Early Leave',
  power_outage: 'Power Outage',
  internet_outage: 'Internet Outage',
  other: 'Other',
};
