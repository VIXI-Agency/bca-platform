'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  useAdminTickets,
  useUpdateTicket,
  useAdminComputers,
  type MaintenanceTicket,
  type TicketStatus,
  type TicketPriority,
} from '@/hooks/use-maintenance';

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

function statusBadge(s: TicketStatus) {
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

export default function TicketsPage() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { userId?: number })?.userId ?? 0;

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [computerFilter, setComputerFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: ticketsData, isLoading } = useAdminTickets({
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    computerId: computerFilter ? parseInt(computerFilter, 10) : undefined,
    page,
    pageSize: 50,
  });
  const { data: computers } = useAdminComputers();
  const updateTicket = useUpdateTicket();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [resolveTarget, setResolveTarget] = useState<MaintenanceTicket | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);

  function showToast(message: string, type: 'success' | 'error') {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  async function handleAssignToMe(ticket: MaintenanceTicket) {
    try {
      await updateTicket.mutateAsync({
        id: ticket.id,
        data: { assignedToUserId: currentUserId, status: 'in-progress' },
      });
      showToast('Ticket assigned to you.', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  async function handleClose(ticket: MaintenanceTicket) {
    try {
      await updateTicket.mutateAsync({ id: ticket.id, data: { status: 'closed' } });
      showToast('Ticket closed.', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  async function handleResolve() {
    if (!resolveTarget) return;
    setSaving(true);
    try {
      await updateTicket.mutateAsync({
        id: resolveTarget.id,
        data: {
          status: 'resolved',
          resolvedDate: new Date().toISOString(),
          resolutionNotes: resolutionNotes.trim() || undefined,
        },
      });
      showToast('Ticket resolved.', 'success');
      setResolveTarget(null);
      setResolutionNotes('');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const tickets = ticketsData?.data ?? [];
  const meta = ticketsData?.meta;

  return (
    <>
      <Header title="IT Maintenance — Tickets" />

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

      <Card className="mx-6">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle>Maintenance Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
            <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter || 'all'} onValueChange={(v) => { setPriorityFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={computerFilter || 'all'} onValueChange={(v) => { setComputerFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All computers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All computers</SelectItem>
                {(computers ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.computerName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loading /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th className="pb-2 w-8" />
                      <th className="pb-2 text-left font-medium">#</th>
                      <th className="pb-2 text-left font-medium">Subject</th>
                      <th className="pb-2 text-left font-medium">Computer</th>
                      <th className="pb-2 text-left font-medium">Reported By</th>
                      <th className="pb-2 text-left font-medium">Priority</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-left font-medium">Date</th>
                      <th className="pb-2 text-left font-medium">Assigned To</th>
                      <th className="pb-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <>
                        <tr
                          key={t.id}
                          style={{ borderBottom: expandedId === t.id ? 'none' : '1px solid var(--border)', color: 'var(--text-primary)' }}
                          className="hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                          onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                        >
                          <td className="py-3 pl-2">
                            {expandedId === t.id
                              ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                              : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                          </td>
                          <td className="py-3" style={{ color: 'var(--text-muted)' }}>#{t.id}</td>
                          <td className="py-3 font-medium">{t.subject}</td>
                          <td className="py-3">{t.computerName}</td>
                          <td className="py-3">{t.reportedByName}</td>
                          <td className="py-3">{priorityBadge(t.priority)}</td>
                          <td className="py-3">{statusBadge(t.status)}</td>
                          <td className="py-3">{fmtDate(t.createdAt)}</td>
                          <td className="py-3" style={{ color: 'var(--text-secondary)' }}>
                            {t.assignedToName ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td className="py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1.5">
                              {t.status === 'open' || t.status === 'in-progress' ? (
                                <>
                                  {t.assignedToUserId !== currentUserId && (
                                    <Button size="sm" variant="outline" onClick={() => handleAssignToMe(t)}>
                                      Assign Me
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => { setResolveTarget(t); setResolutionNotes(''); }}>
                                    Resolve
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => handleClose(t)}>
                                    Close
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {expandedId === t.id && (
                          <tr key={`${t.id}-exp`} style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                            <td colSpan={10} className="px-6 pb-4 pt-2">
                              <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                                <strong>Description:</strong> {t.description}
                              </p>
                              {t.resolutionNotes && (
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                  <strong>Resolution:</strong> {t.resolutionNotes}
                                </p>
                              )}
                              {t.resolvedDate && (
                                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                  Resolved on {fmtDate(t.resolvedDate)}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                    {tickets.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          No tickets found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {meta && meta.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span>{meta.total} tickets</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                    <span className="px-2 py-1">Page {page} / {meta.totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Resolve dialog */}
      <Dialog open={!!resolveTarget} onOpenChange={() => setResolveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Ticket #{resolveTarget?.id}</DialogTitle>
            <DialogDescription>Add optional resolution notes before marking as resolved.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Resolution Notes</Label>
            <textarea
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              rows={4}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="What was done to resolve the issue…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={saving}>
              {saving ? 'Saving…' : 'Mark Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
