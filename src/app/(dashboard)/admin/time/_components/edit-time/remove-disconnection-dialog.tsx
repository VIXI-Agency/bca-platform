'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { DisconnectionEntry } from '@/hooks/use-admin-time';
import { formatSpan } from '../../_lib/format';

interface RemoveDisconnectionDialogProps {
  target: DisconnectionEntry | null;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  error: string | null;
  onRemove: (reason: string) => void;
}

/** Confirms removing a disconnection entered by mistake, with a reason.
 *  The parent keys it by the disconnection, so the reason starts empty. */
export function RemoveDisconnectionDialog({ target, onOpenChange, saving, error, onRemove }: RemoveDisconnectionDialogProps) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Disconnection</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {target && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {new Date(target.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {formatSpan({ start: target.startTime, end: target.endTime })}
              {' — '}
              this time will be paid again. The change is kept in the audit log.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="disc-remove-reason">
              Reason <span className="text-red-400">*</span>
            </Label>
            <textarea
              id="disc-remove-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this being removed? (e.g. disconnected the wrong employee)"
              className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>At least 8 characters.</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onRemove(reason.trim())} disabled={reason.trim().length < 8 || saving}>
            {saving ? (
              <>
                <Loading size="sm" />
                Removing...
              </>
            ) : (
              'Remove'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
