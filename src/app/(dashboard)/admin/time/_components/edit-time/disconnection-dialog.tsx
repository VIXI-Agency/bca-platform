'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
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
import type { DisconnectionEntry, DisconnectionType } from '@/hooks/use-admin-time';
import { DISCONNECTION_TYPE_OPTIONS } from '../../_lib/constants';

export interface DisconnectionFormValues {
  date: string;
  start: string;
  end: string | null;
  type: DisconnectionType;
  reason: string;
}

interface DisconnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  /** null = add a new one; otherwise the disconnection being fixed. */
  editing: DisconnectionEntry | null;
  /** Workdays of the period that can take a disconnection (not in the future). */
  days: string[];
  saving: boolean;
  error: string | null;
  onSave: (values: DisconnectionFormValues) => void;
}

const hhmm = (iso: string | null) => (iso ? iso.substring(11, 16) : '');
const dayLabel = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * Add a disconnection for a past day, or fix the times/type of one entered
 * wrong. The parent gives it a new `key` each time it opens, so the form
 * starts from these props instead of being reset in an effect.
 */
export function DisconnectionDialog({
  open, onOpenChange, employeeName, editing, days, saving, error, onSave,
}: DisconnectionDialogProps) {
  const [date, setDate] = useState(() => editing?.date ?? days[days.length - 1] ?? '');
  const [start, setStart] = useState(() => hhmm(editing?.startTime ?? null));
  const [end, setEnd] = useState(() => hhmm(editing?.endTime ?? null));
  const [type, setType] = useState<DisconnectionType | ''>(() => editing?.type ?? '');
  const [reason, setReason] = useState('');

  const endBeforeStart = start !== '' && end !== '' && end <= start;
  const canSave = !!date && !!start && !!type && !endBeforeStart && reason.trim().length >= 8 && !saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Disconnection' : 'Add Disconnection'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {employeeName} · the time between disconnection and reconnection is taken out of paid hours.
          </p>

          <div className="space-y-2">
            <Label htmlFor="disc-day">Day</Label>
            {editing ? (
              <p id="disc-day" className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {dayLabel(editing.date)}
              </p>
            ) : (
              <Select value={date} onValueChange={setDate}>
                <SelectTrigger id="disc-day">
                  <SelectValue placeholder="Select a day..." />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d} value={d}>
                      {dayLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="disc-start">Disconnected at</Label>
              <Input id="disc-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disc-end">Reconnected at</Label>
              <Input id="disc-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-xs" style={{ color: endBeforeStart ? 'var(--danger)' : 'var(--text-muted)' }}>
            {endBeforeStart
              ? 'The reconnection has to be after the disconnection.'
              : 'Leave “Reconnected at” blank if they never came back that day — it then counts until clock-out.'}
          </p>

          <div className="space-y-2">
            <Label htmlFor="disc-type">Category</Label>
            <Select value={type} onValueChange={(v) => setType(v as DisconnectionType)}>
              <SelectTrigger id="disc-type">
                <SelectValue placeholder="Select a category..." />
              </SelectTrigger>
              <SelectContent>
                {DISCONNECTION_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="disc-reason">
              Reason <span className="text-red-400">*</span>
            </Label>
            <textarea
              id="disc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={editing ? 'Why is this being changed?' : 'Why is this being added now?'}
              className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              At least 8 characters — this shows up on the employee&apos;s Payment Report.
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave({ date, start, end: end || null, type: type as DisconnectionType, reason: reason.trim() })}
            disabled={!canSave}
          >
            {saving ? (
              <>
                <Loading size="sm" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
