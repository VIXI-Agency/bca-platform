'use client';

import { useState } from 'react';
import {
  Monitor,
  AlertCircle,
  Clock,
  CheckCircle,
  Plus,
  Ticket,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useMyComputers,
  useMyTickets,
  useCreateTicket,
  type MyComputer,
  type MaintenanceStatus,
  type TicketPriority,
  type TicketStatus,
} from '@/hooks/use-maintenance';

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

function maintenanceStatusInfo(s: MaintenanceStatus) {
  switch (s) {
    case 'overdue':
      return { label: 'OVERDUE', color: 'var(--danger)', icon: <AlertCircle size={16} /> };
    case 'due-soon':
      return { label: 'DUE SOON', color: '#f59e0b', icon: <Clock size={16} /> };
    case 'ok':
      return { label: 'UP TO DATE', color: 'var(--success)', icon: <CheckCircle size={16} /> };
    default:
      return { label: 'NEVER SERVICED', color: 'var(--text-muted)', icon: <Monitor size={16} /> };
  }
}

function priorityBadge(p: TicketPriority) {
  switch (p) {
    case 'urgent':
      return <Badge variant="destructive">Urgent</Badge>;
    case 'high':
      return <Badge style={{ backgroundColor: '#f97316', color: '#fff' }}>High</Badge>;
    case 'normal':
      return <Badge variant="default">Normal</Badge>;
    case 'low':
      return <Badge variant="outline">Low</Badge>;
  }
}

function ticketStatusBadge(s: TicketStatus) {
  switch (s) {
    case 'open':
      return <Badge variant="default">Open</Badge>;
    case 'in-progress':
      return <Badge style={{ backgroundColor: '#f59e0b', color: '#fff' }}>In Progress</Badge>;
    case 'resolved':
      return <Badge variant="success">Resolved</Badge>;
    case 'closed':
      return <Badge variant="outline">Closed</Badge>;
  }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

/* -------------------------------------------------- */
/*  ComputerCard                                       */
/* -------------------------------------------------- */

function ComputerCard({ computer }: { computer: MyComputer }) {
  const statusInfo = maintenanceStatusInfo(computer.maintenanceStatus);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Computer Name</p>
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{computer.computerName}</p>
        </div>
        {computer.remotePcId && (
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Remote Access ID</p>
            <p style={{ color: 'var(--text-secondary)' }}>{computer.remotePcId}</p>
          </div>
        )}
        {computer.operatingSystem && (
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Operating System</p>
            <p style={{ color: 'var(--text-secondary)' }}>{computer.operatingSystem}</p>
          </div>
        )}
        {computer.specs && (
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Specs</p>
            <p style={{ color: 'var(--text-secondary)' }}>{computer.specs}</p>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Last Preventive Maintenance</p>
          <p style={{ color: 'var(--text-secondary)' }}>{fmtDate(computer.lastPreventiveDate)}</p>
        </div>
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Next Due</p>
          <p style={{ color: 'var(--text-secondary)' }}>{fmtDate(computer.nextDueDate)}</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Maintenance Status</p>
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
            style={{ backgroundColor: statusInfo.color + '20', color: statusInfo.color }}
          >
            {statusInfo.icon}
            {statusInfo.label}
          </div>
        </div>
        {computer.openTicketCount > 0 && (
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Open Tickets</p>
            <p style={{ color: 'var(--accent)' }}>{computer.openTicketCount} open</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/*  Page                                               */
/* -------------------------------------------------- */

interface TicketForm {
  computerId: number | '';
  subject: string;
  description: string;
  priority: TicketPriority;
}

function emptyForm(defaultComputerId: number | ''): TicketForm {
  return { computerId: defaultComputerId, subject: '', description: '', priority: 'normal' };
}

export default function MaintenancePage() {
  const { data: computers, isLoading: computersLoading } = useMyComputers();
  const { data: tickets, isLoading: ticketsLoading } = useMyTickets();
  const createTicket = useCreateTicket();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TicketForm>({ computerId: '', subject: '', description: '', priority: 'normal' });
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);

  function showToast(message: string, type: 'success' | 'error') {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  function openDialog() {
    const defaultId = computers?.length === 1 ? computers[0].id : '';
    setForm(emptyForm(defaultId));
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.computerId || !form.subject.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      await createTicket.mutateAsync({
        computerId: form.computerId as number,
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
      });
      showToast('Maintenance request submitted.', 'success');
      setDialogOpen(false);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const hasComputers = (computers ?? []).length > 0;
  const multipleComputers = (computers ?? []).length > 1;
  const canSubmit = !!form.computerId && !!form.subject.trim() && !!form.description.trim();

  return (
    <>
      <Header title="IT Maintenance" />

      {/* Toast */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-md px-4 py-3 text-sm text-white shadow-lg"
            style={{ backgroundColor: t.type === 'success' ? 'var(--success)' : 'var(--danger)' }}
          >
            {t.message}
          </div>
        ))}
      </div>

      <div className="px-6 flex flex-col gap-6">
        {/* My Computers */}
        {computersLoading ? (
          <Card>
            <CardContent className="flex justify-center py-8"><Loading /></CardContent>
          </Card>
        ) : !hasComputers ? (
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <Monitor size={20} style={{ color: 'var(--accent)' }} />
              <CardTitle>My Computer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No computer assigned. Contact your administrator.
              </p>
            </CardContent>
          </Card>
        ) : (
          (computers ?? []).map((computer) => (
            <Card key={computer.id}>
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <Monitor size={20} style={{ color: 'var(--accent)' }} />
                <CardTitle>{multipleComputers ? computer.computerName : 'My Computer'}</CardTitle>
              </CardHeader>
              <CardContent>
                <ComputerCard computer={computer} />
              </CardContent>
            </Card>
          ))
        )}

        {/* My Tickets */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <div className="flex items-center gap-3">
              <Ticket size={20} style={{ color: 'var(--accent)' }} />
              <CardTitle>My Tickets</CardTitle>
            </div>
            <Button
              size="sm"
              onClick={openDialog}
              disabled={!hasComputers}
              title={!hasComputers ? 'No computer assigned' : undefined}
            >
              <Plus size={16} className="mr-1" /> Request Maintenance
            </Button>
          </CardHeader>
          <CardContent>
            {ticketsLoading ? (
              <div className="flex justify-center py-8"><Loading /></div>
            ) : (tickets ?? []).length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No tickets submitted yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th className="pb-2 text-left font-medium">#</th>
                      <th className="pb-2 text-left font-medium">Computer</th>
                      <th className="pb-2 text-left font-medium">Subject</th>
                      <th className="pb-2 text-left font-medium">Priority</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-left font-medium">Submitted</th>
                      <th className="pb-2 text-left font-medium">Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tickets ?? []).map((t) => (
                      <tr
                        key={t.id}
                        style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        className="hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        <td className="py-3" style={{ color: 'var(--text-muted)' }}>#{t.id}</td>
                        <td className="py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{t.computerName}</td>
                        <td className="py-3 font-medium">{t.subject}</td>
                        <td className="py-3">{priorityBadge(t.priority)}</td>
                        <td className="py-3">{ticketStatusBadge(t.status)}</td>
                        <td className="py-3">{fmtDate(t.createdAt)}</td>
                        <td className="py-3">{fmtDate(t.resolvedDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Request Maintenance Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Maintenance</DialogTitle>
            <DialogDescription>
              Describe the issue with your computer and we will schedule a maintenance visit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {multipleComputers && (
              <div>
                <Label>Computer *</Label>
                <Select
                  value={form.computerId ? String(form.computerId) : ''}
                  onValueChange={(v) => setForm({ ...form, computerId: parseInt(v, 10) })}
                >
                  <SelectTrigger><SelectValue placeholder="Select a computer…" /></SelectTrigger>
                  <SelectContent>
                    {(computers ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.computerName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Subject *</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="e.g. Computer is very slow"
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as TicketPriority })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description *</Label>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the issue in detail…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
              {saving ? 'Submitting…' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
