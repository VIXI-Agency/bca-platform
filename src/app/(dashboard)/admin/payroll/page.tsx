'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  Wallet,
  History,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Ban,
  DollarSign,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  usePayRun,
  useApprovePayRun,
  useMarkStatementsPaid,
  useVoidPayRun,
  usePaymentHistory,
  usePayrollEmployees,
  type PayStatementRow,
} from '@/hooks/use-payroll';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payroll/constants';
import { payPeriodOptions } from '@/lib/time';

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

/** Today's date in the viewer's own calendar, as YYYY-MM-DD (toISOString
 *  would roll over to tomorrow after ~5pm Pacific). */
function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatHours(n: number): string {
  return `${n.toFixed(2)}h`;
}

function statusBadge(status: string | null) {
  switch (status) {
    case 'paid':
      return <Badge variant="success">Paid</Badge>;
    case 'approved':
      return <Badge variant="warning">Approved — will pay</Badge>;
    case 'void':
      return <Badge variant="destructive">Void</Badge>;
    default:
      return <Badge variant="outline">Live preview — not approved</Badge>;
  }
}

/* -------------------------------------------------- */
/*  Main page                                          */
/* -------------------------------------------------- */

export default function AdminPayrollPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;

  // Matches the API's own gate (GET/history allow 1 or 2; approve/pay/void
  // are role-1-only and checked server-side, with the buttons for them
  // hidden below for anyone else) — a role-2 manager granted admin_payroll
  // from the Permissions page should be able to view this page, not just
  // pass middleware and then hit a wall.
  if (userRole !== 1 && userRole !== 2) {
    return (
      <>
        <Header title="Payroll" />
        <div className="flex items-center justify-center pt-20">
          <p style={{ color: 'var(--text-secondary)' }}>You do not have permission to access this page.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Payroll" />
      <div className="mx-auto max-w-7xl space-y-6 pt-6">
        <Tabs defaultValue="run">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="run" className="gap-1.5">
              <Wallet className="h-4 w-4" />
              Pay Run
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              Payment History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="run">
            <PayRunTab canManage={userRole === 1} />
          </TabsContent>

          <TabsContent value="history">
            <PaymentHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/* -------------------------------------------------- */
/*  TAB 1: Pay Run                                     */
/* -------------------------------------------------- */

function PayRunTab({ canManage }: { canManage: boolean }) {
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('direct_deposit');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidDate, setPaidDate] = useState(() => localDateISO(new Date()));
  const [voidReason, setVoidReason] = useState('');

  const weekOptions = useMemo(() => payPeriodOptions(24), []);
  useEffect(() => {
    if (!selectedWeek && weekOptions.length > 0) setSelectedWeek(weekOptions[0].value);
  }, [weekOptions, selectedWeek]);

  const { data, isLoading } = usePayRun(selectedWeek);
  const approve = useApprovePayRun();
  const markPaid = useMarkStatementsPaid();
  const voidRun = useVoidPayRun();

  // Selection doesn't carry over across periods or re-fetches.
  useEffect(() => setSelected(new Set()), [selectedWeek, data?.run.status]);

  function navigateWeek(direction: -1 | 1) {
    const idx = weekOptions.findIndex((w) => w.value === selectedWeek);
    const newIdx = idx - direction;
    if (newIdx >= 0 && newIdx < weekOptions.length) setSelectedWeek(weekOptions[newIdx].value);
  }

  function toggleSelected(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const payableStatements = (data?.statements ?? []).filter(
    (s): s is PayStatementRow & { id: number } => s.id != null && s.status === 'pending',
  );
  const allSelected = payableStatements.length > 0 && payableStatements.every((s) => selected.has(s.id));

  const totals = (data?.statements ?? []).reduce(
    (acc, s) => ({
      regularHours: acc.regularHours + s.regularHours,
      overtimeHours: acc.overtimeHours + s.overtimeHours,
      regularPay: acc.regularPay + s.regularPay,
      overtimePay: acc.overtimePay + s.overtimePay,
      bonusTotal: acc.bonusTotal + s.bonusTotal,
      grossPay: acc.grossPay + s.grossPay,
    }),
    { regularHours: 0, overtimeHours: 0, regularPay: 0, overtimePay: 0, bonusTotal: 0, grossPay: 0 },
  );

  async function handleApprove() {
    await approve.mutateAsync({ period: selectedWeek });
  }

  async function handleMarkPaid() {
    if (!data?.run.id || selected.size === 0) return;
    await markPaid.mutateAsync({
      runId: data.run.id,
      week: selectedWeek,
      statementIds: Array.from(selected),
      paymentMethod,
      paymentReference: paymentReference || undefined,
      paidDate,
    });
    setPayDialogOpen(false);
    setPaymentReference('');
    setSelected(new Set());
  }

  async function handleVoid() {
    if (!data?.run.id) return;
    await voidRun.mutateAsync({ runId: data.run.id, week: selectedWeek, reason: voidReason });
    setVoidDialogOpen(false);
    setVoidReason('');
  }

  const canApprove = canManage && data && data.run.status !== 'paid';
  const canVoid = canManage && data?.run.status === 'approved';
  const showPaySelection = canManage && payableStatements.length > 0;

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-[280px] space-y-2">
              <Label>Pay Period</Label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => navigateWeek(-1)}
                  disabled={weekOptions.findIndex((w) => w.value === selectedWeek) >= weekOptions.length - 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period..." />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => navigateWeek(1)}
                  disabled={weekOptions.findIndex((w) => w.value === selectedWeek) <= 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {statusBadge(data?.run.status ?? null)}
            </div>

            <div className="flex flex-wrap gap-2">
              {canApprove && (
                <Button onClick={handleApprove} disabled={approve.isPending} className="gap-1.5">
                  {approve.isPending ? <Loading size="sm" /> : <CheckCircle2 className="h-4 w-4" />}
                  {data?.run.status === 'approved' ? 'Re-approve (recompute unpaid)' : 'Approve This Period'}
                </Button>
              )}
              {showPaySelection && (
                <Button
                  variant="outline"
                  onClick={() => setPayDialogOpen(true)}
                  disabled={selected.size === 0}
                  className="gap-1.5"
                >
                  <DollarSign className="h-4 w-4" />
                  Mark {selected.size || ''} Paid
                </Button>
              )}
              {canVoid && (
                <Button variant="outline" onClick={() => setVoidDialogOpen(true)} className="gap-1.5 text-red-500">
                  <Ban className="h-4 w-4" />
                  Void Run
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}

      {!isLoading && data && (
        <Card>
          <CardContent className="py-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b text-left text-xs font-medium uppercase tracking-wider"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    {showPaySelection && (
                      <th className="pb-2 pr-2">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) =>
                            setSelected(checked ? new Set(payableStatements.map((s) => s.id)) : new Set())
                          }
                        />
                      </th>
                    )}
                    <th className="pb-2 pr-3">Employee</th>
                    <th className="pb-2 px-3 text-right">Regular</th>
                    <th className="pb-2 px-3 text-right">OT</th>
                    <th className="pb-2 px-3 text-right">Regular Pay</th>
                    <th className="pb-2 px-3 text-right">OT Pay</th>
                    <th className="pb-2 px-3 text-right">Bonuses</th>
                    <th className="pb-2 px-3 text-right">Gross</th>
                    <th className="pb-2 pl-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.statements.map((s) => (
                    <tr key={s.userId} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      {showPaySelection && (
                        <td className="py-2 pr-2">
                          {s.id != null && s.status === 'pending' && (
                            <Checkbox
                              checked={selected.has(s.id)}
                              onCheckedChange={(checked) => toggleSelected(s.id as number, checked === true)}
                            />
                          )}
                        </td>
                      )}
                      <td className="py-2 pr-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {s.employeeName}
                        {s.payRate == null && (
                          <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                            (no rate set)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{formatHours(s.regularHours)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: s.overtimeHours ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {s.overtimeHours ? formatHours(s.overtimeHours) : '--'}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(s.regularPay)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{s.overtimePay ? formatCurrency(s.overtimePay) : '--'}</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{s.bonusTotal ? formatCurrency(s.bonusTotal) : '--'}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(s.grossPay)}</td>
                      <td className="py-2 pl-3">
                        {s.status === 'paid' ? (
                          <Badge variant="success">Paid{s.paidDate ? ` ${s.paidDate}` : ''}</Badge>
                        ) : s.status === 'void' ? (
                          <Badge variant="destructive">Void</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2" style={{ borderColor: 'var(--border)' }}>
                    <td colSpan={showPaySelection ? 2 : 1} className="py-2 pr-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Totals
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold">{formatHours(totals.regularHours)}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold">{formatHours(totals.overtimeHours)}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold">{formatCurrency(totals.regularPay)}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold">{formatCurrency(totals.overtimePay)}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold">{formatCurrency(totals.bonusTotal)}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totals.grossPay)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {selected.size} Employee{selected.size === 1 ? '' : 's'} Paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reference (optional)</Label>
              <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Confirmation #, batch ID, etc." />
            </div>
            <div className="space-y-1">
              <Label>Date Paid</Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkPaid} disabled={markPaid.isPending}>
              {markPaid.isPending ? <Loading size="sm" /> : 'Confirm Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void This Pay Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              This unlocks the period for editing again. Only allowed while nothing in it has been marked paid.
            </p>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Why is this run being voided?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={voidReason.trim().length < 8 || voidRun.isPending}>
              {voidRun.isPending ? <Loading size="sm" /> : 'Void Run'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------- */
/*  TAB 2: Payment History                             */
/* -------------------------------------------------- */

function PaymentHistoryTab() {
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data: employees } = usePayrollEmployees();
  const { data, isLoading } = usePaymentHistory({
    userId: employeeFilter !== 'all' ? Number(employeeFilter) : undefined,
    status: statusFilter !== 'all' ? (statusFilter as 'pending' | 'paid' | 'void') : undefined,
    page,
  });

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[220px] space-y-1">
            <Label className="text-xs">Employee</Label>
            <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees?.map((e) => (
                  <SelectItem key={e.userId} value={String(e.userId)}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px] space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending (will pay)</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}

      {!isLoading && data && (
        <Card>
          <CardContent className="py-4">
            {data.data.length === 0 ? (
              <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No payment history matches these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="border-b text-left text-xs font-medium uppercase tracking-wider"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      <th className="pb-2 pr-3">Period</th>
                      <th className="pb-2 px-3">Employee</th>
                      <th className="pb-2 px-3 text-right">Gross</th>
                      <th className="pb-2 px-3">Status</th>
                      <th className="pb-2 px-3">Paid</th>
                      <th className="pb-2 pl-3">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((s) => (
                      <tr key={s.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2 pr-3" style={{ color: 'var(--text-secondary)' }}>{s.periodStart} – {s.periodEnd}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{s.employeeName}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(s.grossPay)}</td>
                        <td className="px-3 py-2">
                          {s.status === 'paid' ? <Badge variant="success">Paid</Badge> : s.status === 'void' ? <Badge variant="destructive">Void</Badge> : <Badge variant="outline">Pending</Badge>}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{s.paidDate ?? '--'}</td>
                        <td className="pl-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                          {s.paymentMethod ? PAYMENT_METHOD_LABELS[s.paymentMethod as PaymentMethod] ?? s.paymentMethod : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.total > data.pageSize && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {(page - 1) * data.pageSize + 1}-{Math.min(page * data.pageSize, data.total)} of {data.total}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * data.pageSize >= data.total}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
