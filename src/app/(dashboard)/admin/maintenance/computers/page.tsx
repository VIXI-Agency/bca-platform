'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Plus, Pencil, Trash2, Search, Monitor,
  AlertCircle, Clock, CheckCircle, Ticket, X, MonitorPlay,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  useAdminComputers, useCreateComputer, useUpdateComputer, useRetireComputer,
  type Computer, type MaintenanceStatus,
} from '@/hooks/use-maintenance';
import { useUsers } from '@/hooks/use-users';
import LogMaintenanceDialog from './log-maintenance-dialog';

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

function statusBadge(ms: MaintenanceStatus) {
  switch (ms) {
    case 'overdue':   return <Badge variant="destructive">Overdue</Badge>;
    case 'due-soon':  return <Badge style={{ backgroundColor: '#f59e0b', color: '#fff' }}>Due Soon</Badge>;
    case 'ok':        return <Badge variant="success">Up to Date</Badge>;
    default:          return <Badge variant="outline">Never Serviced</Badge>;
  }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

/* -------------------------------------------------- */
/*  Inline editable cell                               */
/* -------------------------------------------------- */

function InlineEditCell({
  value,
  onSave,
  placeholder = '—',
}: {
  value: string | null;
  onSave: (next: string) => Promise<void>;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
  }

  async function commit() {
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value ?? '');
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        onBlur={commit}
        disabled={saving}
        className="w-full rounded border px-2 py-0.5 text-sm outline-none focus:ring-1"
        style={{
          borderColor: 'var(--accent)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          minWidth: 80,
        }}
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1 rounded px-1 py-0.5 text-left text-sm transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ color: value ? 'var(--text-secondary)' : 'var(--text-muted)', minWidth: 60 }}
      title="Click to edit"
    >
      <span>{value || placeholder}</span>
      <Pencil size={10} className="opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

/* -------------------------------------------------- */
/*  Multi-user selector                                */
/* -------------------------------------------------- */

interface UserOption { userId: number; name: string; lastname: string; }

function UserMultiSelect({
  allUsers,
  selectedIds,
  onChange,
}: {
  allUsers: UserOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = allUsers.filter((u) => {
    const full = `${u.name} ${u.lastname}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  function toggle(id: number) {
    onChange(selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]);
  }

  const selectedUsers = allUsers.filter((u) => selectedIds.includes(u.userId));

  return (
    <div className="space-y-2">
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedUsers.map((u) => (
            <span
              key={u.userId}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
            >
              {u.name} {u.lastname}
              <button onClick={() => toggle(u.userId)} className="ml-0.5 hover:opacity-70">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <Input
          className="pl-7 text-xs"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div
        className="max-h-40 overflow-y-auto rounded-md border p-1"
        style={{ borderColor: 'var(--border)' }}
      >
        {filtered.length === 0 ? (
          <p className="px-2 py-1 text-xs" style={{ color: 'var(--text-muted)' }}>No users found</p>
        ) : (
          filtered.map((u) => (
            <label
              key={u.userId}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--bg-elevated)]"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(u.userId)}
                onChange={() => toggle(u.userId)}
                className="accent-[var(--accent)]"
              />
              <span style={{ color: 'var(--text-primary)' }}>{u.name} {u.lastname}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/*  Form state                                         */
/* -------------------------------------------------- */

interface ComputerForm {
  computerName: string;
  remotePcId: string;
  ipAddress: string;
  assignedUserIds: number[];
  operatingSystem: string;
  specs: string;
  notes: string;
  maintenanceIntervalMonths: string;
}

const EMPTY_FORM: ComputerForm = {
  computerName: '',
  remotePcId: '',
  ipAddress: '',
  assignedUserIds: [],
  operatingSystem: '',
  specs: '',
  notes: '',
  maintenanceIntervalMonths: '3',
};

function formFromComputer(c: Computer): ComputerForm {
  return {
    computerName: c.computerName,
    remotePcId: c.remotePcId ?? '',
    ipAddress: c.ipAddress ?? '',
    assignedUserIds: c.assignedUsers.map((u) => u.id),
    operatingSystem: c.operatingSystem ?? '',
    specs: c.specs ?? '',
    notes: c.notes ?? '',
    maintenanceIntervalMonths: String(c.maintenanceIntervalMonths),
  };
}

/* -------------------------------------------------- */
/*  Page                                               */
/* -------------------------------------------------- */

export default function ComputersPage() {
  const [search, setSearch] = useState('');
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: computers, isLoading } = useAdminComputers({ search, maintenanceStatus: maintenanceStatusFilter, status: statusFilter });
  const { data: users } = useUsers();
  const createComputer = useCreateComputer();
  const updateComputer = useUpdateComputer();
  const retireComputer = useRetireComputer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Computer | null>(null);
  const [form, setForm] = useState<ComputerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [logTarget, setLogTarget] = useState<Computer | null>(null);
  const [confirmRetire, setConfirmRetire] = useState<Computer | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);

  function showToast(message: string, type: 'success' | 'error') {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  function openCreate() { setEditTarget(null); setForm(EMPTY_FORM); setDialogOpen(true); }
  function openEdit(c: Computer) { setEditTarget(c); setForm(formFromComputer(c)); setDialogOpen(true); }

  async function handleSave() {
    if (!form.computerName.trim()) return;
    setSaving(true);
    const payload = {
      computerName: form.computerName.trim(),
      remotePcId: form.remotePcId.trim() || undefined,
      ipAddress: form.ipAddress.trim() || undefined,
      assignedUserIds: form.assignedUserIds,
      operatingSystem: form.operatingSystem.trim() || undefined,
      specs: form.specs.trim() || undefined,
      notes: form.notes.trim() || undefined,
      maintenanceIntervalMonths: parseInt(form.maintenanceIntervalMonths, 10),
    };
    try {
      if (editTarget) {
        await updateComputer.mutateAsync({ id: editTarget.id, data: payload });
        showToast('Computer updated.', 'success');
      } else {
        await createComputer.mutateAsync(payload);
        showToast('Computer added.', 'success');
      }
      setDialogOpen(false);
    } catch (e) { showToast((e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  async function handleRetire() {
    if (!confirmRetire) return;
    try {
      await retireComputer.mutateAsync(confirmRetire.id);
      showToast('Computer retired.', 'success');
    } catch (e) { showToast((e as Error).message, 'error'); }
    finally { setConfirmRetire(null); }
  }

  async function inlineSave(id: number, field: 'remotePcId' | 'ipAddress', value: string) {
    try {
      await updateComputer.mutateAsync({ id, data: { [field]: value || undefined } });
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  const totalActive = computers?.filter((c) => c.status === 'active').length ?? 0;
  const overdueCount = computers?.filter((c) => c.maintenanceStatus === 'overdue').length ?? 0;
  const dueSoonCount = computers?.filter((c) => c.maintenanceStatus === 'due-soon').length ?? 0;
  const openTickets = computers?.reduce((sum, c) => sum + c.openTicketCount, 0) ?? 0;
  const activeUsers = users?.filter((u) => u.isActive) ?? [];

  return (
    <>
      <Header title="IT Maintenance — Computers" />

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-md px-4 py-3 text-sm text-white shadow-lg"
            style={{ backgroundColor: t.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 px-6 pb-2 sm:grid-cols-4">
        {[
          { icon: <Monitor size={20} style={{ color: 'var(--accent)' }} />, label: 'Total Active', value: totalActive, color: 'var(--text-primary)' },
          { icon: <AlertCircle size={20} style={{ color: 'var(--danger)' }} />, label: 'Overdue', value: overdueCount, color: 'var(--danger)' },
          { icon: <Clock size={20} style={{ color: '#f59e0b' }} />, label: 'Due Soon (30d)', value: dueSoonCount, color: '#f59e0b' },
          { icon: <Ticket size={20} style={{ color: 'var(--accent)' }} />, label: 'Open Tickets', value: openTickets, color: 'var(--accent)' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              {s.icon}
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="mx-6">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle>Computers</CardTitle>
          <Button onClick={openCreate} size="sm"><Plus size={16} className="mr-1" /> Add Computer</Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-52">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <Input className="pl-8" placeholder="Search name or employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={maintenanceStatusFilter || 'all'} onValueChange={(v) => setMaintenanceStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Maint. status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="due-soon">Due Soon</SelectItem>
                <SelectItem value="ok">Up to Date</SelectItem>
                <SelectItem value="never">Never Serviced</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter || 'active'} onValueChange={(v) => setStatusFilter(v === 'active' ? '' : v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loading /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {['Computer', 'Remote ID ✎', 'IP Address ✎', 'Assigned To', 'OS', 'Last Maint.', 'Next Due', 'Status', 'Tickets', 'Actions'].map((h) => (
                      <th key={h} className="pb-2 pr-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(computers ?? []).map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      className="hover:bg-[var(--bg-elevated)] transition-colors">
                      <td className="py-3 pr-3 font-medium">{c.computerName}</td>
                      <td className="py-2 pr-3">
                        <InlineEditCell
                          value={c.remotePcId}
                          placeholder="—"
                          onSave={(v) => inlineSave(c.id, 'remotePcId', v)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <InlineEditCell
                          value={c.ipAddress}
                          placeholder="—"
                          onSave={(v) => inlineSave(c.id, 'ipAddress', v)}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        {c.assignedUsers.length === 0
                          ? <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                          : <div className="flex flex-wrap gap-1">
                              {c.assignedUsers.map((u) => (
                                <span key={u.id} className="rounded px-1.5 py-0.5 text-xs"
                                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                  {u.name}
                                </span>
                              ))}
                            </div>}
                      </td>
                      <td className="py-3 pr-3" style={{ color: 'var(--text-secondary)' }}>{c.operatingSystem ?? '—'}</td>
                      <td className="py-3 pr-3">{fmtDate(c.lastPreventiveDate)}</td>
                      <td className="py-3 pr-3">{fmtDate(c.nextDueDate)}</td>
                      <td className="py-3 pr-3">{statusBadge(c.maintenanceStatus)}</td>
                      <td className="py-3 pr-3">
                        {c.openTicketCount > 0
                          ? <Badge variant="outline">{c.openTicketCount} open</Badge>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          {c.remotePcId && c.status === 'active' && (
                            <a
                              href={`anydesk://${c.remotePcId}`}
                              title={`Connect to ${c.computerName}`}
                            >
                              <Button size="sm" variant="outline" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                                <MonitorPlay size={13} className="mr-1" /> Connect
                              </Button>
                            </a>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setLogTarget(c)}>
                            <CheckCircle size={13} className="mr-1" /> Log
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}><Pencil size={13} /></Button>
                          {c.status !== 'retired' && (
                            <Button size="sm" variant="outline" onClick={() => setConfirmRetire(c)}><Trash2 size={13} /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(computers ?? []).length === 0 && (
                    <tr><td colSpan={10} className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>No computers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Computer' : 'Add Computer'}</DialogTitle>
            <DialogDescription>{editTarget ? 'Update computer details.' : 'Register a new remote computer.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Computer Name *</Label>
                <Input value={form.computerName} onChange={(e) => setForm({ ...form, computerName: e.target.value })} placeholder="AGENT-PC-01" />
              </div>
              <div>
                <Label>Remote ID (AnyDesk / RustDesk)</Label>
                <Input value={form.remotePcId} onChange={(e) => setForm({ ...form, remotePcId: e.target.value })} placeholder="123456789" />
              </div>
              <div>
                <Label>IP Address</Label>
                <Input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} placeholder="192.168.1.100" />
              </div>
              <div>
                <Label>OS</Label>
                <Input value={form.operatingSystem} onChange={(e) => setForm({ ...form, operatingSystem: e.target.value })} placeholder="Windows 11 Pro" />
              </div>
              <div>
                <Label>Maintenance Interval</Label>
                <Select value={form.maintenanceIntervalMonths} onValueChange={(v) => setForm({ ...form, maintenanceIntervalMonths: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 6].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} month{n > 1 ? 's' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Specs</Label>
                <Input value={form.specs} onChange={(e) => setForm({ ...form, specs: e.target.value })} placeholder="i5 8GB RAM 256GB SSD" />
              </div>
              <div className="col-span-2">
                <Label className="mb-2 block">Assigned Employees</Label>
                <UserMultiSelect
                  allUsers={activeUsers}
                  selectedIds={form.assignedUserIds}
                  onChange={(ids) => setForm({ ...form, assignedUserIds: ids })}
                />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <textarea className="w-full rounded-md border px-3 py-2 text-sm" rows={2}
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.computerName.trim()}>
              {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Computer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retire confirm */}
      <Dialog open={!!confirmRetire} onOpenChange={() => setConfirmRetire(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire Computer?</DialogTitle>
            <DialogDescription>&ldquo;{confirmRetire?.computerName}&rdquo; will be marked as retired.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRetire(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRetire}>Retire</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Maintenance Dialog */}
      {logTarget && (
        <LogMaintenanceDialog
          computer={logTarget}
          users={activeUsers}
          onClose={() => setLogTarget(null)}
          onSuccess={(msg) => showToast(msg, 'success')}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </>
  );
}
