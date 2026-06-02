'use client';

import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import DOMPurify from 'isomorphic-dompurify';
/** Decode HTML entities (named and numeric) */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Strip all HTML tags and decode entities to render uniform plain text */
function stripHtml(html: string): string {
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr|ul|ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  text = text.replace(/\n{2,}/g, '\n').trim();
  return text;
}
import {
  Phone,
  MapPin,
  Building2,
  Globe,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Undo2,
  MessageCircle,
  DollarSign,
  User,
  Mail,
  Calendar,
  PhoneCall,
  Search,
  X,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatPhone } from '@/lib/utils';
import {
  useDispositions,
  useFilters,
  useClosers,
  useNextLead,
  useLogCall,
  useRevertBusiness,
  useRebuttals,
  type LeadBusiness,
  type LogCallPayload,
} from '@/hooks/use-calls';

/* -------------------------------------------------- */
/*  Constants                                          */
/* -------------------------------------------------- */

const DISPOSITION_POTENTIAL_CLIENT = 4;
const DISPOSITION_CALL_BACK = 8;
const DISPOSITION_INFO_REQUEST = 10;

const DISPOSITIONS_WITH_FORM = new Set([
  DISPOSITION_POTENTIAL_CLIENT,
  DISPOSITION_INFO_REQUEST,
  DISPOSITION_CALL_BACK,
]);

function getSubmitLabel(id: number | null): string {
  switch (id) {
    case DISPOSITION_POTENTIAL_CLIENT:
      return 'Submit Potential Client';
    case DISPOSITION_INFO_REQUEST:
      return 'Submit Info Request';
    case DISPOSITION_CALL_BACK:
      return 'Submit Call Back';
    default:
      return 'Log & Next Call';
  }
}

/* -------------------------------------------------- */
/*  Form data shape                                    */
/* -------------------------------------------------- */

interface CallFormData {
  dmakerName: string;
  dmakerEmail: string;
  dmakerPhone: string;
  debtorName: string;
  debtAmount: string;
  agreementSent: string;
  idCloser: string;
  callBack: string;
  comments: string;
}

const defaultValues: CallFormData = {
  dmakerName: '',
  dmakerEmail: '',
  dmakerPhone: '',
  debtorName: '',
  debtAmount: '',
  agreementSent: '',
  idCloser: '',
  callBack: '',
  comments: '',
};

/* -------------------------------------------------- */
/*  Toast                                              */
/* -------------------------------------------------- */

interface Toast {
  message: string;
  type: 'success' | 'error';
}

function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-5 py-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
        color: 'var(--text-primary)',
      }}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: 'var(--success)' }} />
      ) : (
        <AlertCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--danger)' }} />
      )}
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  );
}

/* -------------------------------------------------- */
/*  Rebuttal Tabs                                      */
/* -------------------------------------------------- */

/* -------------------------------------------------- */
/*  Main Page                                          */
/* -------------------------------------------------- */

export default function CallsPage() {
  /* ---- Queries ---- */
  const { data: dispositions, isLoading: loadingDispos } = useDispositions();
  const { data: filters, isLoading: loadingFilters } = useFilters();
  const { data: closers } = useClosers();
  const { data: rebuttals, isLoading: loadingRebuttals } = useRebuttals();

  /* ---- Mutations ---- */
  const nextLead = useNextLead();
  const logCall = useLogCall();
  const revertBusiness = useRevertBusiness();

  /* ---- Local state ---- */
  const [timezone, setTimezone] = useState('');
  const [industry, setIndustry] = useState('');
  const [lead, setLead] = useState<LeadBusiness | null>(null);
  const [previousLead, setPreviousLead] = useState<LeadBusiness | null>(null);
  const [selectedDisposition, setSelectedDisposition] = useState<number | null>(null);
  const [lastCallId, setLastCallId] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rebuttalsOpen, setRebuttalsOpen] = useState(true);
  const [selectedRebuttalId, setSelectedRebuttalId] = useState<number | null>(null);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [searchResults, setSearchResults] = useState<LeadBusiness[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  /* ---- Form ---- */
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CallFormData>({ defaultValues });

  const closerValue = watch('idCloser');

  // Register the closer field so its validation rules are tracked
  // (the value is set via setValue from the custom Select, not a native input).
  register('idCloser', {
    required:
      selectedDisposition === DISPOSITION_POTENTIAL_CLIENT
        ? 'Assigned closer is required'
        : false,
  });

  /* ---- Show toast ---- */
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  /* ---- Fetch a new lead from the server ---- */
  const doFetchLead = useCallback(() => {
    nextLead.mutate(
      { timezone, industry: industry && industry !== 'random' ? industry : undefined },
      {
        onSuccess: (data) => {
          setLead(data);
          setSelectedDisposition(null);
          reset(defaultValues);
        },
        onError: (err) => {
          setLead(null);
          if (err.message.includes('No leads') || err.message.includes('404')) {
            showToast('No leads available for the selected filters.', 'error');
          } else {
            showToast(err.message || 'Failed to fetch lead.', 'error');
          }
        },
      },
    );
  }, [timezone, industry, nextLead, reset, showToast]);

  /* ---- Search by phone ---- */
  const doPhoneSearch = useCallback(async () => {
    const digits = phoneSearch.replace(/\D/g, '');
    if (digits.length < 4) {
      showToast('Enter at least 4 digits to search.', 'error');
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/businesses?search=${encodeURIComponent(digits)}&status=all&pageSize=10`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(data.data ?? []);
      if ((data.data ?? []).length === 0) {
        showToast('No businesses found for that phone number.', 'error');
      }
    } catch {
      showToast('Failed to search businesses.', 'error');
    } finally {
      setIsSearching(false);
    }
  }, [phoneSearch, showToast]);

  const loadFromSearch = useCallback((business: LeadBusiness) => {
    setLead(business);
    setSelectedDisposition(null);
    reset(defaultValues);
    setSearchResults(null);
    setPhoneSearch('');
    showToast(`Loaded: ${business.businessName}`, 'success');
  }, [reset, showToast]);

  /* ---- Revert last ---- */
  const handleRevert = useCallback(() => {
    if (!previousLead) return;
    revertBusiness.mutate(
      { idBusiness: previousLead.idBusiness, idCall: lastCallId ?? undefined },
      {
        onSuccess: () => {
          setLead(previousLead);
          setPreviousLead(null);
          setLastCallId(null);
          setSelectedDisposition(null);
          reset(defaultValues);
          showToast('Business reverted successfully.', 'success');
        },
        onError: () => showToast('Failed to revert.', 'error'),
      },
    );
  }, [previousLead, lastCallId, revertBusiness, reset, showToast]);

  /* ---- Submit call ---- */
  const onSubmit = useCallback(
    (formData: CallFormData) => {
      if (!lead || selectedDisposition === null) return;

      const payload: LogCallPayload = {
        idBusiness: lead.idBusiness,
        idDisposition: selectedDisposition,
      };

      // Populate payload based on disposition
      if (DISPOSITIONS_WITH_FORM.has(selectedDisposition)) {
        if (formData.comments.trim()) payload.comments = formData.comments.trim();
        if (formData.dmakerName.trim()) payload.dmakerName = formData.dmakerName.trim();
        if (formData.dmakerEmail.trim()) payload.dmakerEmail = formData.dmakerEmail.trim();
        if (formData.dmakerPhone.trim()) payload.dmakerPhone = formData.dmakerPhone.trim();
        if (formData.idCloser) payload.idCloser = Number(formData.idCloser);
      }

      if (
        selectedDisposition === DISPOSITION_POTENTIAL_CLIENT ||
        selectedDisposition === DISPOSITION_CALL_BACK
      ) {
        if (formData.callBack) payload.callBack = formData.callBack;
      }

      if (selectedDisposition === DISPOSITION_POTENTIAL_CLIENT) {
        if (formData.debtorName.trim()) payload.debtorName = formData.debtorName.trim();
        if (formData.debtAmount) payload.debtAmount = parseFloat(formData.debtAmount);
        if (formData.agreementSent) payload.agreementSent = formData.agreementSent === 'yes';
      }

      logCall.mutate(payload, {
        onSuccess: (result) => {
          showToast('Call logged successfully!', 'success');
          setPreviousLead(lead);
          setLastCallId(result.idCall);
          setLead(null);
          setSelectedDisposition(null);
          reset(defaultValues);
          // Auto-load next lead
          if (timezone) {
            nextLead.mutate(
              { timezone, industry: industry && industry !== 'random' ? industry : undefined },
              {
                onSuccess: (data) => {
                  setLead(data);
                },
                onError: () => {
                  setLead(null);
                },
              },
            );
          }
        },
        onError: (err) => showToast(err.message || 'Failed to log call.', 'error'),
      });
    },
    [lead, selectedDisposition, logCall, nextLead, timezone, industry, reset, showToast],
  );

  /* ---- Unified main button handler ---- */
  const handleMainButton = useCallback(() => {
    // No lead loaded yet → need a timezone to fetch one
    if (!lead) {
      if (!timezone) {
        showToast('Please select a timezone first.', 'error');
        return;
      }
      doFetchLead();
      return;
    }

    // Lead loaded but no disposition selected → error
    if (selectedDisposition === null) {
      showToast('Please select a disposition before getting the next lead.', 'error');
      return;
    }

    // Has disposition with form (Potential Client, Info Request, Call Back) → handled by form submit
    if (DISPOSITIONS_WITH_FORM.has(selectedDisposition)) {
      handleSubmit(onSubmit)();
      return;
    }

    // Quick disposition (no form) → log and get next
    onSubmit(defaultValues);
  }, [timezone, lead, selectedDisposition, doFetchLead, showToast, handleSubmit, onSubmit]);

  /* ---- Determine which form fields to show ---- */
  const showDecisionMaker = DISPOSITIONS_WITH_FORM.has(selectedDisposition ?? -1);
  const showDebtorInfo = selectedDisposition === DISPOSITION_POTENTIAL_CLIENT;
  const showAgreement = selectedDisposition === DISPOSITION_POTENTIAL_CLIENT;
  const showCloser = DISPOSITIONS_WITH_FORM.has(selectedDisposition ?? -1);
  const showCallback =
    selectedDisposition === DISPOSITION_POTENTIAL_CLIENT ||
    selectedDisposition === DISPOSITION_CALL_BACK;
  const showComments = DISPOSITIONS_WITH_FORM.has(selectedDisposition ?? -1);
  const showFullForm = DISPOSITIONS_WITH_FORM.has(selectedDisposition ?? -1);

  // Potential Client requires all of its fields to be filled in.
  const requirePC = selectedDisposition === DISPOSITION_POTENTIAL_CLIENT;

  const isSubmitting = logCall.isPending || nextLead.isPending;

  return (
    <>
      <Header title="Calls" />

      <div className="mx-auto max-w-[1200px] pt-6">
        <div className="space-y-5">
            {/* ---- Filter Bar ---- */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  {/* Timezone */}
                  <div className="min-w-[200px] flex-1">
                    <Label className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Timezone <span style={{ color: 'var(--danger)' }}>*</span>
                    </Label>
                    {loadingFilters ? (
                      <div className="flex h-10 items-center">
                        <Loading size="sm" />
                      </div>
                    ) : (
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {filters?.timezones.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Industry */}
                  <div className="min-w-[200px] flex-1">
                    <Label className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Industry
                    </Label>
                    {loadingFilters ? (
                      <div className="flex h-10 items-center">
                        <Loading size="sm" />
                      </div>
                    ) : (
                      <Select value={industry} onValueChange={setIndustry}>
                        <SelectTrigger>
                          <SelectValue placeholder="Random Industry" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="random">Random Industry</SelectItem>
                          {filters?.industries.map((ind) => (
                            <SelectItem key={ind} value={ind}>
                              {ind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Unified Main Button: Get Lead / Log & Next Call */}
                  <Button
                    onClick={handleMainButton}
                    disabled={(!lead && !timezone) || isSubmitting}
                    size="lg"
                    className="shrink-0"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : lead ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <PhoneCall className="h-4 w-4" />
                    )}
                    {lead ? (showFullForm ? getSubmitLabel(selectedDisposition) : 'Log & Next Call') : 'Get Lead'}
                  </Button>

                  {/* Revert Button */}
                  {previousLead && (
                    <Button
                      variant="outline"
                      onClick={handleRevert}
                      disabled={revertBusiness.isPending}
                      className="shrink-0"
                    >
                      {revertBusiness.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4" />
                      )}
                      Revert Last
                    </Button>
                  )}
                </div>

                {/* Phone Search */}
                <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-end gap-3">
                    <div className="min-w-[240px] flex-1">
                      <Label className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Search by Phone Number
                      </Label>
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                          style={{ color: 'var(--text-muted)' }}
                        />
                        <Input
                          placeholder="Enter phone number..."
                          value={phoneSearch}
                          onChange={(e) => setPhoneSearch(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') doPhoneSearch(); }}
                          className="pl-9"
                        />
                        {phoneSearch && (
                          <button
                            type="button"
                            onClick={() => { setPhoneSearch(''); setSearchResults(null); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={doPhoneSearch}
                      disabled={isSearching || phoneSearch.replace(/\D/g, '').length < 4}
                      className="shrink-0"
                    >
                      {isSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      Search
                    </Button>
                  </div>

                  {/* Search Results */}
                  {searchResults && searchResults.length > 0 && (
                    <div
                      className="mt-3 max-h-60 overflow-y-auto rounded-lg border"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
                    >
                      {searchResults.map((biz) => (
                        <button
                          key={biz.idBusiness}
                          type="button"
                          onClick={() => loadFromSearch(biz)}
                          className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--accent-subtle)]"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {biz.businessName}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {formatPhone(biz.phone)} &middot; {biz.location || biz.timezone || 'N/A'}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            Load
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ---- Loading State ---- */}
            {nextLead.isPending && !lead && (
              <Card>
                <CardContent className="flex items-center justify-center p-12">
                  <div className="text-center">
                    <Loading className="mx-auto mb-3" />
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Finding your next lead...
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ---- Empty State ---- */}
            {!lead && !nextLead.isPending && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-16">
                  <div
                    className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: 'var(--accent-subtle)' }}
                  >
                    <Phone className="h-8 w-8" style={{ color: 'var(--accent)' }} />
                  </div>
                  <h3
                    className="mb-1 text-lg font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Ready to start calling
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Select a timezone and click &quot;Get Lead&quot; to load your first business.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* ---- Business Info Card ---- */}
            {lead && (
              <Card className="overflow-hidden">
                <div
                  className="h-1 w-full"
                  style={{ background: 'linear-gradient(90deg, var(--accent), var(--purple))' }}
                />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{lead.businessName}</CardTitle>
                      <a
                        href={`tel:${lead.phone}`}
                        className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold"
                        style={{ color: 'var(--accent)' }}
                      >
                        <Phone className="h-4 w-4" />
                        {formatPhone(lead.phone)}
                      </a>
                    </div>
                    <Badge variant="default">Lead</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                    <InfoItem
                      icon={MapPin}
                      label="Address"
                      value={lead.address || 'N/A'}
                    />
                    <InfoItem
                      icon={Globe}
                      label="Location"
                      value={lead.location || 'N/A'}
                    />
                    <InfoItem
                      icon={Building2}
                      label="Industry"
                      value={lead.industry || 'N/A'}
                    />
                    <InfoItem
                      icon={Globe}
                      label="Timezone"
                      value={lead.timezone || 'N/A'}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ---- Disposition Selection ---- */}
            {lead && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Disposition</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingDispos ? (
                    <Loading className="py-4" />
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {dispositions?.map((d) => {
                        const isActive = selectedDisposition === d.idDisposition;
                        return (
                          <button
                            key={d.idDisposition}
                            type="button"
                            onClick={() => {
                              setSelectedDisposition(d.idDisposition);
                              reset(defaultValues);
                            }}
                            className="rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all"
                            style={{
                              borderColor: isActive
                                ? 'var(--accent)'
                                : 'var(--border)',
                              backgroundColor: isActive
                                ? 'rgba(0, 212, 255, 0.08)'
                                : 'var(--bg-card)',
                              color: isActive
                                ? 'var(--accent)'
                                : 'var(--text-primary)',
                              boxShadow: isActive
                                ? '0 0 12px rgba(0, 212, 255, 0.15)'
                                : 'none',
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor: isActive
                                    ? 'var(--accent)'
                                    : 'var(--text-muted)',
                                }}
                              />
                              {d.disposition}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---- Rebuttals ---- */}
            {lead && (
              <Card>
                <CardHeader className="pb-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between"
                    onClick={() => setRebuttalsOpen(!rebuttalsOpen)}
                  >
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageCircle className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                      Rebuttals
                    </CardTitle>
                    <ChevronDown
                      className="h-4 w-4 transition-transform"
                      style={{
                        color: 'var(--text-muted)',
                        transform: rebuttalsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      }}
                    />
                  </button>
                </CardHeader>
                {rebuttalsOpen && (
                  <CardContent>
                    {loadingRebuttals ? (
                      <Loading className="py-6" />
                    ) : rebuttals && rebuttals.length > 0 ? (
                      <>
                        {/* Tab buttons */}
                        <div className="flex flex-wrap gap-1.5">
                          {rebuttals.map((r) => {
                            const isSelected = selectedRebuttalId === r.idRebuttal;
                            return (
                              <button
                                key={r.idRebuttal}
                                type="button"
                                onClick={() =>
                                  setSelectedRebuttalId(isSelected ? null : r.idRebuttal)
                                }
                                className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                                style={{
                                  borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                                  backgroundColor: isSelected ? 'rgba(0, 212, 255, 0.1)' : 'var(--bg-card)',
                                  color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                                }}
                              >
                                {decodeEntities(r.title)}
                              </button>
                            );
                          })}
                        </div>

                        {/* Selected rebuttal content */}
                        {selectedRebuttalId && (() => {
                          const selected = rebuttals.find((r) => r.idRebuttal === selectedRebuttalId);
                          if (!selected) return null;
                          return (
                            <div
                              className="mt-4 rounded-lg border p-4 text-sm leading-relaxed"
                              style={{
                                borderColor: 'var(--border)',
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <h4
                                className="mb-2 text-center text-base font-semibold"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {decodeEntities(selected.title)}
                              </h4>
                              {selected.content.includes('<table') ? (
                                <div
                                  className="overflow-x-auto"
                                  suppressHydrationWarning
                                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content) }}
                                />
                              ) : (
                                <span className="whitespace-pre-wrap">{stripHtml(selected.content)}</span>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        No rebuttals available.
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            )}

            {/* ---- Dynamic Form ---- */}
            {lead && selectedDisposition !== null && showFullForm && (
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(onSubmit)(); }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Call Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Decision Maker Section */}
                      {showDecisionMaker && (
                        <fieldset>
                          <legend
                            className="mb-3 flex items-center gap-2 text-sm font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <User className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                            Decision Maker
                          </legend>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div>
                              <Label htmlFor="dmakerName" className="mb-1.5 block text-xs">
                                Name {requirePC && <span style={{ color: 'var(--danger)' }}>*</span>}
                              </Label>
                              <Input
                                id="dmakerName"
                                placeholder="Full name"
                                aria-invalid={!!errors.dmakerName}
                                {...register('dmakerName', {
                                  required: requirePC ? 'Name is required' : false,
                                })}
                              />
                              {errors.dmakerName && (
                                <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                                  {errors.dmakerName.message}
                                </p>
                              )}
                            </div>
                            <div>
                              <Label htmlFor="dmakerEmail" className="mb-1.5 block text-xs">
                                Email {requirePC && <span style={{ color: 'var(--danger)' }}>*</span>}
                              </Label>
                              <div className="relative">
                                <Mail
                                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                                  style={{ color: 'var(--text-muted)' }}
                                />
                                <Input
                                  id="dmakerEmail"
                                  type="email"
                                  placeholder="email@example.com"
                                  className="pl-9"
                                  aria-invalid={!!errors.dmakerEmail}
                                  {...register('dmakerEmail', {
                                    required: requirePC ? 'Email is required' : false,
                                    validate: (v) =>
                                      !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email',
                                  })}
                                />
                              </div>
                              {errors.dmakerEmail && (
                                <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                                  {errors.dmakerEmail.message}
                                </p>
                              )}
                            </div>
                            <div>
                              <Label htmlFor="dmakerPhone" className="mb-1.5 block text-xs">
                                Phone {requirePC && <span style={{ color: 'var(--danger)' }}>*</span>}
                              </Label>
                              <div className="relative">
                                <Phone
                                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                                  style={{ color: 'var(--text-muted)' }}
                                />
                                <Input
                                  id="dmakerPhone"
                                  type="tel"
                                  placeholder="(555) 555-5555"
                                  className="pl-9"
                                  aria-invalid={!!errors.dmakerPhone}
                                  {...register('dmakerPhone', {
                                    required: requirePC ? 'Phone is required' : false,
                                  })}
                                />
                              </div>
                              {errors.dmakerPhone && (
                                <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                                  {errors.dmakerPhone.message}
                                </p>
                              )}
                            </div>
                          </div>
                        </fieldset>
                      )}

                      {/* Debtor Info */}
                      {showDebtorInfo && (
                        <fieldset>
                          <legend
                            className="mb-3 flex items-center gap-2 text-sm font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <DollarSign className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                            Debtor Information
                          </legend>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <Label htmlFor="debtorName" className="mb-1.5 block text-xs">
                                Debtor Name {requirePC && <span style={{ color: 'var(--danger)' }}>*</span>}
                              </Label>
                              <Input
                                id="debtorName"
                                placeholder="Debtor full name"
                                aria-invalid={!!errors.debtorName}
                                {...register('debtorName', {
                                  required: requirePC ? 'Debtor name is required' : false,
                                })}
                              />
                              {errors.debtorName && (
                                <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                                  {errors.debtorName.message}
                                </p>
                              )}
                            </div>
                            <div>
                              <Label htmlFor="debtAmount" className="mb-1.5 block text-xs">
                                Amount Owed {requirePC && <span style={{ color: 'var(--danger)' }}>*</span>}
                              </Label>
                              <div className="relative">
                                <span
                                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  $
                                </span>
                                <Input
                                  id="debtAmount"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  className="pl-7"
                                  aria-invalid={!!errors.debtAmount}
                                  {...register('debtAmount', {
                                    required: requirePC ? 'Amount owed is required' : false,
                                    validate: (v) =>
                                      !requirePC || (!!v && parseFloat(v) > 0) || 'Enter an amount greater than 0',
                                  })}
                                />
                              </div>
                              {errors.debtAmount && (
                                <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                                  {errors.debtAmount.message}
                                </p>
                              )}
                            </div>
                          </div>
                        </fieldset>
                      )}

                      {/* Agreement Sent */}
                      {showAgreement && (
                        <fieldset>
                          <legend
                            className="mb-3 text-sm font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Agreement Sent {requirePC && <span style={{ color: 'var(--danger)' }}>*</span>}
                          </legend>
                          <div className="flex gap-3">
                            {['yes', 'no'].map((val) => (
                              <label
                                key={val}
                                className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all"
                                style={{
                                  borderColor: 'var(--border)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                <input
                                  type="radio"
                                  value={val}
                                  {...register('agreementSent', {
                                    required: requirePC ? 'Please select Yes or No' : false,
                                  })}
                                  className="accent-[var(--accent)]"
                                />
                                {val === 'yes' ? 'Yes' : 'No'}
                              </label>
                            ))}
                          </div>
                          {errors.agreementSent && (
                            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                              {errors.agreementSent.message}
                            </p>
                          )}
                        </fieldset>
                      )}

                      {/* Closer Assignment */}
                      {showCloser && (
                        <div>
                          <Label className="mb-1.5 block text-xs">
                            Assigned Closer {requirePC && <span style={{ color: 'var(--danger)' }}>*</span>}
                          </Label>
                          <Select
                            value={closerValue || undefined}
                            onValueChange={(val) =>
                              setValue('idCloser', val, { shouldValidate: true })
                            }
                          >
                            <SelectTrigger className="max-w-sm">
                              <SelectValue placeholder="Select a closer" />
                            </SelectTrigger>
                            <SelectContent>
                              {closers?.map((c) => (
                                <SelectItem key={c.userId} value={String(c.userId)}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.idCloser && (
                            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                              {errors.idCloser.message}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Callback Date */}
                      {showCallback && (
                        <div>
                          <Label htmlFor="callBack" className="mb-1.5 block text-xs">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                              Callback Date {requirePC && <span style={{ color: 'var(--danger)' }}>*</span>}
                            </span>
                          </Label>
                          <Input
                            id="callBack"
                            type="datetime-local"
                            className="max-w-sm"
                            aria-invalid={!!errors.callBack}
                            {...register('callBack', {
                              required: requirePC ? 'Callback date is required' : false,
                            })}
                          />
                          {errors.callBack && (
                            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                              {errors.callBack.message}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Comments */}
                      {showComments && (
                        <div>
                          <Label htmlFor="comments" className="mb-1.5 block text-xs">
                            Comments
                          </Label>
                          <textarea
                            id="comments"
                            rows={3}
                            placeholder="Add notes about this call..."
                            className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
                            {...register('comments')}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
              </form>
            )}

        </div>
      </div>

      {/* ---- Toast ---- */}
      {toast && (
        <ToastNotification toast={toast} onClose={() => setToast(null)} />
      )}
    </>
  );
}

/* -------------------------------------------------- */
/*  Small helper component                             */
/* -------------------------------------------------- */

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: 'var(--text-muted)' }}
      />
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <p
          className="truncate text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
