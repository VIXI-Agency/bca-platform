'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { DayLog } from '@/hooks/use-admin-time';
import { formatTime } from '../../_lib/format';
import { fieldLabel } from '../../_lib/constants';

interface EditTimeDialogProps {
  editDialogOpen: boolean;
  setEditDialogOpen: (open: boolean) => void;
  selectedEmployeeName: string;
  editingDay: DayLog | null;
  editingField: string;
  editNewValue: string;
  setEditNewValue: (value: string) => void;
  editReason: string;
  setEditReason: (value: string) => void;
  editMutation: { isPending: boolean; error: Error | null };
  handleEditSave: () => void;
}

/** Change one time on one day, with a mandatory reason for the audit log. */
export function EditTimeDialog({
  editDialogOpen,
  setEditDialogOpen,
  selectedEmployeeName,
  editingDay,
  editingField,
  editNewValue,
  setEditNewValue,
  editReason,
  setEditReason,
  editMutation,
  handleEditSave,
}: EditTimeDialogProps) {
  return (
    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Time Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-[var(--text-muted)]">
                Employee
              </Label>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {selectedEmployeeName}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[var(--text-muted)]">Date</Label>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {editingDay
                  ? new Date(editingDay.date + 'T00:00:00').toLocaleDateString(
                      'en-US',
                      {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      }
                    )
                  : ''}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-[var(--text-muted)]">Field</Label>
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {fieldLabel(editingField)}
            </p>
          </div>

          <Separator />

          {/* Current value */}
          <div className="space-y-1">
            <Label className="text-xs text-[var(--text-muted)]">
              Current Value
            </Label>
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {editingDay
                ? formatTime(
                    (editingDay as unknown as Record<string, unknown>)[
                      editingField
                    ] as string | undefined
                  )
                : '--:--'}
            </p>
          </div>

          {/* New value */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-new-value">New Time (HH:mm)</Label>
              {editNewValue.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => setEditNewValue('')}
                  className="text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                >
                  Clear (no entry)
                </button>
              )}
            </div>
            <Input
              id="edit-new-value"
              type="time"
              value={editNewValue}
              onChange={(e) => setEditNewValue(e.target.value)}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Leave blank to clear this entry — e.g. a break or lunch the
              employee didn&apos;t take.
            </p>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="edit-reason">
              Reason <span className="text-red-400">*</span>
            </Label>
            <textarea
              id="edit-reason"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              rows={3}
              placeholder="Explain why this time is being changed... (e.g. employee forgot to clock in)"
              className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              At least 8 characters — this shows up on the employee&apos;s Payment Report.
            </p>
          </div>
          {editMutation.error && (
            <p className="text-sm text-red-500">{editMutation.error.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setEditDialogOpen(false)}
            disabled={editMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleEditSave}
            disabled={editReason.trim().length < 8 || editMutation.isPending}
          >
            {editMutation.isPending ? (
              <>
                <Loading size="sm" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
