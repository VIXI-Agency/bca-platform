'use client';

import { Button } from '@/components/ui/button';
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
import type { EmployeeStatus, DisconnectionType } from '@/hooks/use-admin-time';
import { DISCONNECTION_TYPE_OPTIONS } from '../../_lib/constants';

interface DisconnectDialogProps {
  disconnectTarget: EmployeeStatus | null;
  setDisconnectTarget: (emp: EmployeeStatus | null) => void;
  disconnectAction: 'disconnect' | 'reconnect';
  disconnectType: DisconnectionType | '';
  setDisconnectType: (type: DisconnectionType | '') => void;
  disconnectReason: string;
  setDisconnectReason: (reason: string) => void;
  disconnectMutation: { isPending: boolean; error: Error | null };
  handleDisconnect: () => void;
}

/** Confirms a disconnect (with category and reason) or a reconnect. */
export function DisconnectDialog({
  disconnectTarget,
  setDisconnectTarget,
  disconnectAction,
  disconnectType,
  setDisconnectType,
  disconnectReason,
  setDisconnectReason,
  disconnectMutation,
  handleDisconnect,
}: DisconnectDialogProps) {
  return (
    <Dialog
      open={!!disconnectTarget}
      onOpenChange={(open) => {
        if (!open) setDisconnectTarget(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {disconnectAction === 'disconnect'
              ? 'Disconnect Employee'
              : 'Reconnect Employee'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {disconnectAction === 'disconnect'
              ? `Are you sure you want to disconnect ${disconnectTarget?.name}? They will be clocked out immediately.`
              : `Are you sure you want to reconnect ${disconnectTarget?.name}?`}
          </p>
          {disconnectAction === 'disconnect' && (
            <div className="space-y-2">
              <Label htmlFor="disconnect-type">Category</Label>
              <Select
                value={disconnectType}
                onValueChange={(v) => setDisconnectType(v as DisconnectionType)}
              >
                <SelectTrigger id="disconnect-type">
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
          )}
          <div className="space-y-2">
            <Label htmlFor="disconnect-reason">
              Reason {disconnectAction === 'disconnect' ? '(recommended)' : '(optional)'}
            </Label>
            <textarea
              id="disconnect-reason"
              value={disconnectReason}
              onChange={(e) => setDisconnectReason(e.target.value)}
              rows={3}
              placeholder="Enter reason..."
              className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            />
          </div>
          {disconnectMutation.error && (
            <p className="text-sm text-red-500">{disconnectMutation.error.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDisconnectTarget(null)}
            disabled={disconnectMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant={disconnectAction === 'disconnect' ? 'destructive' : 'default'}
            onClick={handleDisconnect}
            disabled={disconnectMutation.isPending}
          >
            {disconnectMutation.isPending ? (
              <>
                <Loading size="sm" />
                Processing...
              </>
            ) : disconnectAction === 'disconnect' ? (
              'Disconnect'
            ) : (
              'Reconnect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
