'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import {
  useDisconnections,
  useAddDisconnection,
  useEditDisconnection,
  useRemoveDisconnection,
  type DisconnectionEntry,
} from '@/hooks/use-admin-time';
import { formatDuration, formatSpan } from '../../_lib/format';
import { DISCONNECTION_TYPE_OPTIONS } from '../../_lib/constants';
import { DisconnectionDialog, type DisconnectionFormValues } from './disconnection-dialog';
import { RemoveDisconnectionDialog } from './remove-disconnection-dialog';

interface DisconnectionsPanelProps {
  userId: number;
  week: string;
  employeeName: string;
  /** The period's workdays (from the timesheet). */
  workDates: string[];
  /** Approved or paid: nothing here can change. */
  locked: boolean;
}

const typeLabel = (type: string) => DISCONNECTION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? 'Other';

/** Today in the viewer's own calendar, as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The week's disconnections for one employee, with Edit / Remove for ones
 * entered wrong and "Add disconnection" for one nobody recorded at the time.
 * Paid hours above recalculate as soon as any of these change.
 */
export function DisconnectionsPanel({ userId, week, employeeName, workDates, locked }: DisconnectionsPanelProps) {
  const { data, isLoading } = useDisconnections(userId, week);
  const addMutation = useAddDisconnection();
  const editMutation = useEditDisconnection();
  const removeMutation = useRemoveDisconnection();

  const [dialogOpen, setDialogOpen] = useState(false);
  // A new key per opening so the dialog's form starts from the row being edited.
  const [dialogKey, setDialogKey] = useState(0);
  const [editing, setEditing] = useState<DisconnectionEntry | null>(null);
  const [removing, setRemoving] = useState<DisconnectionEntry | null>(null);

  const today = localToday();
  const pastDays = workDates.filter((d) => d <= today);
  const entries = data?.data ?? [];
  const saveMutation = editing ? editMutation : addMutation;

  function openAdd() {
    addMutation.reset();
    setEditing(null);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  function openEdit(entry: DisconnectionEntry) {
    editMutation.reset();
    setEditing(entry);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  function openRemove(entry: DisconnectionEntry) {
    removeMutation.reset();
    setRemoving(entry);
  }

  async function handleSave(values: DisconnectionFormValues) {
    try {
      if (editing) {
        await editMutation.mutateAsync({ id: editing.id, start: values.start, end: values.end, type: values.type, reason: values.reason });
      } else {
        await addMutation.mutateAsync({ userId, ...values });
      }
      setDialogOpen(false);
    } catch {
      /* the dialog stays open and shows the error */
    }
  }

  async function handleRemove(reason: string) {
    if (!removing) return;
    try {
      await removeMutation.mutateAsync({ id: removing.id, reason });
      setRemoving(null);
    } catch {
      /* the dialog stays open and shows the error */
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <WifiOff className="h-4 w-4" style={{ color: 'var(--accent)' }} />
          Disconnections This Week
        </CardTitle>
        {!locked && (
          <Button size="sm" variant="outline" className="gap-1" onClick={openAdd} disabled={pastDays.length === 0}>
            <Plus className="h-4 w-4" />
            Add disconnection
          </Button>
        )}
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loading size="sm" />
          </div>
        )}
        {!isLoading && entries.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No disconnections this week.
          </p>
        )}
        {entries.length > 0 && (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {entries.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-28 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {formatSpan({ start: d.startTime, end: d.endTime })}
                  {d.durationMinutes != null && ` (${formatDuration(d.durationMinutes)})`}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {typeLabel(d.type)}
                  {d.reason && ` · ${d.reason}`}
                </span>
                {!locked && (
                  <span className="ml-auto flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)} aria-label="Edit disconnection">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[var(--danger)] hover:text-[var(--danger)]"
                      onClick={() => openRemove(d)}
                      aria-label="Remove disconnection"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <DisconnectionDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employeeName={employeeName}
        editing={editing}
        days={pastDays}
        saving={saveMutation.isPending}
        error={saveMutation.error?.message ?? null}
        onSave={handleSave}
      />
      <RemoveDisconnectionDialog
        key={removing?.id ?? 'closed'}
        target={removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        saving={removeMutation.isPending}
        error={removeMutation.error?.message ?? null}
        onRemove={handleRemove}
      />
    </Card>
  );
}
