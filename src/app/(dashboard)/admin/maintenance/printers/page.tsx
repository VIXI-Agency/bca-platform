'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Printer as PrinterIcon } from 'lucide-react';
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
  useAdminPrinters, useCreatePrinter, useUpdatePrinter, useRetirePrinter,
  type Printer,
} from '@/hooks/use-maintenance';

function InlineEditCell({
  value,
  onSave,
  placeholder = '—',
  type = 'text',
}: {
  value: string | null;
  onSave: (next: string) => Promise<void>;
  placeholder?: string;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Sync external value changes
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

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
        type={type}
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
      onClick={() => { setDraft(value ?? ''); setEditing(true); }}
      className="group flex items-center gap-1 rounded px-1 py-0.5 text-left text-sm transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ color: value ? 'var(--text-secondary)' : 'var(--text-muted)', minWidth: 60 }}
      title="Click to edit"
    >
      <span>{value || placeholder}</span>
      <Pencil size={10} className="opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

function InlineBoolCell({
  value,
  onSave,
}: {
  value: boolean;
  onSave: (next: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try { await onSave(!value); }
    finally { setSaving(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className="rounded px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
      style={{
        background: value ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
        color: value ? 'var(--accent)' : 'var(--text-muted)',
      }}
      title="Click to toggle"
    >
      {saving ? '…' : value ? 'Yes' : 'No'}
    </button>
  );
}

interface PrinterForm {
  printerName: string;
  brandModel: string;
  ipAddress: string;
  location: string;
  foldersSharing: boolean;
  sharedFolders: string;
  notes: string;
}

const EMPTY_FORM: PrinterForm = {
  printerName: '',
  brandModel: '',
  ipAddress: '',
  location: '',
  foldersSharing: false,
  sharedFolders: '',
  notes: '',
};

function formFromPrinter(p: Printer): PrinterForm {
  return {
    printerName: p.printerName,
    brandModel: p.brandModel ?? '',
    ipAddress: p.ipAddress ?? '',
    location: p.location ?? '',
    foldersSharing: p.foldersSharing,
    sharedFolders: p.sharedFolders ?? '',
    notes: p.notes ?? '',
  };
}

export default function PrintersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: printers, isLoading } = useAdminPrinters({ search, status: statusFilter });
  const createPrinter = useCreatePrinter();
  const updatePrinter = useUpdatePrinter();
  const retirePrinter = useRetirePrinter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Printer | null>(null);
  const [form, setForm] = useState<PrinterForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState<Printer | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);

  function showToast(message: string, type: 'success' | 'error') {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  function openCreate() { setEditTarget(null); setForm(EMPTY_FORM); setDialogOpen(true); }
  function openEdit(p: Printer) { setEditTarget(p); setForm(formFromPrinter(p)); setDialogOpen(true); }

  async function handleSave() {
    if (!form.printerName.trim()) return;
    setSaving(true);
    const payload = {
      printerName: form.printerName.trim(),
      brandModel: form.brandModel.trim() || undefined,
      ipAddress: form.ipAddress.trim() || undefined,
      location: form.location.trim() || undefined,
      foldersSharing: form.foldersSharing,
      sharedFolders: form.foldersSharing && form.sharedFolders.trim()
        ? form.sharedFolders.trim()
        : undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (editTarget) {
        await updatePrinter.mutateAsync({ id: editTarget.id, data: payload });
        showToast('Printer updated.', 'success');
      } else {
        await createPrinter.mutateAsync(payload);
        showToast('Printer added.', 'success');
      }
      setDialogOpen(false);
    } catch (e) { showToast((e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  async function handleRetire() {
    if (!confirmRetire) return;
    try {
      await retirePrinter.mutateAsync(confirmRetire.id);
      showToast('Printer retired.', 'success');
    } catch (e) { showToast((e as Error).message, 'error'); }
    finally { setConfirmRetire(null); }
  }

  async function inlineSaveField(id: number, field: keyof Printer, value: string | boolean) {
    try {
      await updatePrinter.mutateAsync({ id, data: { [field]: value || undefined } });
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  async function inlineSaveBool(id: number, field: 'foldersSharing', value: boolean) {
    try {
      await updatePrinter.mutateAsync({ id, data: { [field]: value } });
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  const totalActive = printers?.filter((p) => p.status === 'active').length ?? 0;
  const sharingCount = printers?.filter((p) => p.foldersSharing).length ?? 0;

  return (
    <>
      <Header title="IT Maintenance — Printers" />

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
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PrinterIcon size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Active</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{totalActive}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PrinterIcon size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sharing Folders</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{sharingCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="mx-6">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle>Printers</CardTitle>
          <Button onClick={openCreate} size="sm"><Plus size={16} className="mr-1" /> Add Printer</Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-52">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <Input className="pl-8" placeholder="Search name, location, IP…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
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
                    {['Printer Name ✎', 'Brand/Model ✎', 'IP Address ✎', 'Location ✎', 'Folder Sharing ✎', 'Shared Folders ✎', 'Notes ✎', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="pb-2 pr-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(printers ?? []).map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      className="hover:bg-[var(--bg-elevated)] transition-colors">
                      <td className="py-2 pr-3 font-medium">
                        <InlineEditCell
                          value={p.printerName}
                          onSave={(v) => inlineSaveField(p.id, 'printerName', v)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <InlineEditCell
                          value={p.brandModel}
                          placeholder="—"
                          onSave={(v) => inlineSaveField(p.id, 'brandModel', v)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <InlineEditCell
                          value={p.ipAddress}
                          placeholder="—"
                          onSave={(v) => inlineSaveField(p.id, 'ipAddress', v)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <InlineEditCell
                          value={p.location}
                          placeholder="—"
                          onSave={(v) => inlineSaveField(p.id, 'location', v)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <InlineBoolCell
                          value={p.foldersSharing}
                          onSave={(v) => inlineSaveBool(p.id, 'foldersSharing', v)}
                        />
                      </td>
                      <td className="py-2 pr-3" style={{ maxWidth: 180 }}>
                        {p.foldersSharing ? (
                          <InlineEditCell
                            value={p.sharedFolders}
                            placeholder="Enter folder paths…"
                            onSave={(v) => inlineSaveField(p.id, 'sharedFolders', v)}
                          />
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3" style={{ maxWidth: 160 }}>
                        <InlineEditCell
                          value={p.notes}
                          placeholder="—"
                          onSave={(v) => inlineSaveField(p.id, 'notes', v)}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        {p.status === 'active'
                          ? <Badge variant="success">Active</Badge>
                          : <Badge variant="outline">Retired</Badge>}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Pencil size={13} /></Button>
                          {p.status !== 'retired' && (
                            <Button size="sm" variant="outline" onClick={() => setConfirmRetire(p)}><Trash2 size={13} /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(printers ?? []).length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                        No printers found.
                      </td>
                    </tr>
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
            <DialogTitle>{editTarget ? 'Edit Printer' : 'Add Printer'}</DialogTitle>
            <DialogDescription>
              {editTarget ? 'Update printer details.' : 'Register a new printer in the inventory.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Printer Name *</Label>
                <Input
                  value={form.printerName}
                  onChange={(e) => setForm({ ...form, printerName: e.target.value })}
                  placeholder="HP LaserJet Pro M404n"
                />
              </div>
              <div>
                <Label>Brand / Model</Label>
                <Input
                  value={form.brandModel}
                  onChange={(e) => setForm({ ...form, brandModel: e.target.value })}
                  placeholder="HP LaserJet Pro M404n"
                />
              </div>
              <div>
                <Label>IP Address</Label>
                <Input
                  value={form.ipAddress}
                  onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                  placeholder="192.168.1.50"
                />
              </div>
              <div className="col-span-2">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="2nd floor, Office B"
                />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-[var(--accent)] h-4 w-4"
                    checked={form.foldersSharing}
                    onChange={(e) => setForm({ ...form, foldersSharing: e.target.checked, sharedFolders: e.target.checked ? form.sharedFolders : '' })}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Shares folders</span>
                </label>
              </div>
              {form.foldersSharing && (
                <div className="col-span-2">
                  <Label>Shared Folders</Label>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    rows={3}
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    placeholder={`\\\\PRINTER01\\Documents\n\\\\PRINTER01\\Reports`}
                    value={form.sharedFolders}
                    onChange={(e) => setForm({ ...form, sharedFolders: e.target.value })}
                  />
                </div>
              )}
              <div className="col-span-2">
                <Label>Notes</Label>
                <textarea
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={2}
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.printerName.trim()}>
              {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Printer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retire confirm */}
      <Dialog open={!!confirmRetire} onOpenChange={() => setConfirmRetire(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire Printer?</DialogTitle>
            <DialogDescription>
              &ldquo;{confirmRetire?.printerName}&rdquo; will be marked as retired.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRetire(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRetire}>Retire</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
