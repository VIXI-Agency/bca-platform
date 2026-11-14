'use client';

import { useState, useCallback } from 'react';
import {
  Search,
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatPhone } from '@/lib/utils';
import {
  useClients,
  useAvailableBusinesses,
  useUpdateBusinessStatus,
  type ClientBusiness,
} from '@/hooks/use-clients';

const PAGE_SIZE = 15;
const STATUS_EXISTING = 7;

function BusinessTable({
  data,
  isLoading,
  emptyMessage,
  action,
}: {
  data: ClientBusiness[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
  action?: (business: ClientBusiness) => React.ReactNode;
}) {
  if (isLoading) {
    return <Loading className="py-12" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--accent-subtle)' }}
        >
          <Building2 className="h-6 w-6" style={{ color: 'var(--accent)' }} />
        </div>
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b text-left"
            style={{ borderColor: 'var(--border)' }}
          >
            {['Business Name', 'Phone', 'Address', 'Location', 'Industry', 'Timezone'].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {h}
                </th>
              ),
            )}
            {action && (
              <th
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right"
                style={{ color: 'var(--text-muted)' }}
              >
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((biz) => (
            <tr
              key={biz.idBusiness}
              className="border-b transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <td
                className="px-4 py-3 font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {biz.businessName}
              </td>
              <td
                className="px-4 py-3"
                style={{ color: 'var(--accent)' }}
              >
                {formatPhone(biz.phone)}
              </td>
              <td
                className="px-4 py-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                {biz.address || 'N/A'}
              </td>
              <td
                className="px-4 py-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                {biz.location || 'N/A'}
              </td>
              <td
                className="px-4 py-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                {biz.industry || 'N/A'}
              </td>
              <td
                className="px-4 py-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                {biz.timezone || 'N/A'}
              </td>
              {action && (
                <td className="px-4 py-3 text-right">{action(biz)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const [existingSearch, setExistingSearch] = useState('');
  const [existingPage, setExistingPage] = useState(1);

  const [availableSearch, setAvailableSearch] = useState('');
  const [availablePage, setAvailablePage] = useState(1);

  const [confirmBusiness, setConfirmBusiness] = useState<ClientBusiness | null>(null);

  const {
    data: existingData,
    isLoading: loadingExisting,
  } = useClients(existingSearch, existingPage, PAGE_SIZE);

  const {
    data: availableData,
    isLoading: loadingAvailable,
  } = useAvailableBusinesses(availableSearch, availablePage, PAGE_SIZE);

  const updateStatus = useUpdateBusinessStatus();

  const handleConfirmMark = useCallback(() => {
    if (!confirmBusiness) return;
    updateStatus.mutate(
      { idBusiness: confirmBusiness.idBusiness, idStatus: STATUS_EXISTING },
      {
        onSuccess: () => setConfirmBusiness(null),
      },
    );
  }, [confirmBusiness, updateStatus]);

  const handleExistingSearchChange = useCallback((val: string) => {
    setExistingSearch(val);
    setExistingPage(1);
  }, []);

  const handleAvailableSearchChange = useCallback((val: string) => {
    setAvailableSearch(val);
    setAvailablePage(1);
  }, []);

  return (
    <>
      <Header title="Existing Clients" />

      <div className="mx-auto max-w-[1400px] pt-6">
        <Tabs defaultValue="existing">
          <TabsList>
            <TabsTrigger value="existing">Existing Clients</TabsTrigger>
            <TabsTrigger value="mark">Mark as Existing</TabsTrigger>
          </TabsList>

          <TabsContent value="existing">
            <Card className="mt-4">
              {/* Search */}
              <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="relative max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <Input
                    placeholder="Search by name, phone..."
                    className="pl-9"
                    value={existingSearch}
                    onChange={(e) => handleExistingSearchChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Table */}
              <BusinessTable
                data={existingData?.data}
                isLoading={loadingExisting}
                emptyMessage="No existing clients found"
              />

              {/* Pagination */}
              {existingData && (
                <Pagination
                  page={existingData.page}
                  totalPages={existingData.totalPages}
                  onPageChange={setExistingPage}
                />
              )}
            </Card>
          </TabsContent>

          <TabsContent value="mark">
            <Card className="mt-4">
              {/* Search */}
              <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="relative max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <Input
                    placeholder="Search available businesses..."
                    className="pl-9"
                    value={availableSearch}
                    onChange={(e) => handleAvailableSearchChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Table */}
              <BusinessTable
                data={availableData?.data}
                isLoading={loadingAvailable}
                emptyMessage="No available businesses found"
                action={(biz) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmBusiness(biz)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark as Existing
                  </Button>
                )}
              />

              {/* Pagination */}
              {availableData && (
                <Pagination
                  page={availableData.page}
                  totalPages={availableData.totalPages}
                  onPageChange={setAvailablePage}
                />
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={!!confirmBusiness}
        onOpenChange={(open) => !open && setConfirmBusiness(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this business as an existing client?
            </DialogDescription>
          </DialogHeader>

          {confirmBusiness && (
            <div
              className="rounded-lg border p-4"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              <p
                className="font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {confirmBusiness.businessName}
              </p>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {formatPhone(confirmBusiness.phone)}
                {confirmBusiness.location && ` - ${confirmBusiness.location}`}
              </p>
            </div>
          )}

          {updateStatus.isError && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--danger-subtle)',
                color: 'var(--danger)',
              }}
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {updateStatus.error?.message || 'Failed to update status.'}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmBusiness(null)}
              disabled={updateStatus.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmMark}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
