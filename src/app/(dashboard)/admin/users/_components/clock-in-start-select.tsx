'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CLOCK_IN_START_OPTIONS,
  DEFAULT_CLOCK_IN_START,
  formatClockInStart,
  savedClockInStart,
  type ClockInStart,
} from '@/lib/clock/clock-in-start';

interface ClockInStartSelectProps {
  /** The saved shift start, or null while the user is on the default. */
  value: ClockInStart | null;
  onChange: (start: ClockInStart | null) => void;
}

/** When this user's shift starts: the earliest time a clock-in is recorded as. */
export const ClockInStartSelect = ({ value, onChange }: ClockInStartSelectProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-4">
    <div className="min-w-0 flex-1">
      <Label htmlFor="user-clock-in-start" className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        Clock-in start
      </Label>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Pacific time. Earlier punches are recorded as this time.
      </p>
    </div>
    <Select
      value={String(value ?? DEFAULT_CLOCK_IN_START)}
      onValueChange={(minutes) => onChange(savedClockInStart(Number(minutes)))}
    >
      <SelectTrigger id="user-clock-in-start" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CLOCK_IN_START_OPTIONS.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)}>
            {formatClockInStart(minutes)}
            {minutes === DEFAULT_CLOCK_IN_START ? ' (default)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
