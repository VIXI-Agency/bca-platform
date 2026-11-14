'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminLogs, useAdminComputers, type MaintenanceType } from '@/hooks/use-maintenance';
import { useUsers } from '@/hooks/use-users';
import LogMaintenanceDialog from '../computers/log-maintenance-dialog';
import type { Computer } from '@/hooks/use-maintenance';

function typeBadge(t: MaintenanceType) {
  switch (t) {
    case 'preventive':
      return <Badge variant="success">Preventive</Badge>;
    case 'corrective':
      return <Badge variant="warning">Corrective</Badge>;
    case 'emergency':
      return <Badge variant="destructive">Emergency</Badge>;
  }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

export default function LogsPage() {
  const [computerFilter, setComputerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: logsData, isLoading } = useAdminLogs({
    computerId: computerFilter ? parseInt(computerFilter, 10) : undefined,
    type: typeFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: 50,
  });

  const { data: computers } = useAdminComputers();
  const { data: users } = useUsers();
  const activeUsers = users?.filter((u) => u.isActive) ?? [];

  const [logTarget, setLogTarget] = useState<Computer | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);

  function showToast(message: string, type: 'success' | 'error') {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  const logs = logsData?.data ?? [];
  const meta = logsData?.meta;

  return (
    <>
      <Header title="IT Maintenance — Logs" />

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
          <CardTitle>Maintenance Logs</CardTitle>
          <Button size="sm" onClick={() => setLogTarget(null)} disabled>
            <Plus size={16} className="mr-1" /> Log Maintenance
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
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
            <Select value={typeFilter || 'all'} onValueChange={(v) => { setTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="preventive">Preventive</SelectItem>
                <SelectItem value="corrective">Corrective</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-36"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-36"
              placeholder="To"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loading /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th className="pb-2 text-left font-medium">Date</th>
                      <th className="pb-2 text-left font-medium">Computer</th>
                      <th className="pb-2 text-left font-medium">Type</th>
                      <th className="pb-2 text-left font-medium">Technician</th>
                      <th className="pb-2 text-left font-medium">Duration</th>
                      <th className="pb-2 text-left font-medium">Tools Used</th>
                      <th className="pb-2 text-left font-medium">Ticket #</th>
                      <th className="pb-2 text-left font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr
                        key={l.id}
                        style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        className="hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        <td className="py-3">{fmtDate(l.performedDate)}</td>
                        <td className="py-3 font-medium">{l.computerName}</td>
                        <td className="py-3">{typeBadge(l.maintenanceType)}</td>
                        <td className="py-3">{l.technicianName}</td>
                        <td className="py-3" style={{ color: 'var(--text-secondary)' }}>
                          {l.durationMinutes ? `${l.durationMinutes}m` : '—'}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {l.toolsUsed.length > 0
                              ? l.toolsUsed.map((t) => (
                                  <span
                                    key={t}
                                    className="rounded px-1.5 py-0.5 text-xs"
                                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                                  >
                                    {t}
                                  </span>
                                ))
                              : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </div>
                        </td>
                        <td className="py-3">
                          {l.relatedTicket ? (
                            <span style={{ color: 'var(--accent)' }}>#{l.relatedTicket.id}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td className="py-3 max-w-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span className="line-clamp-1">{l.notes ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          No logs found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {meta && meta.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span>{meta.total} records</span>
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

      {/* Log dialog (opened from this page by selecting a computer first) */}
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
