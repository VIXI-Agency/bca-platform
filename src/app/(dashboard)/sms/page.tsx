'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Plus,
  Phone,
  Loader2,
  Search,
  Check,
  CheckCheck,
  Clock,
  XCircle,
  Pencil,
  FileText,
  Image as ImageIcon,
  Paperclip,
  X,
  Trash2,
  LayoutTemplate,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatPhone, formatDateTime } from '@/lib/utils';
import {
  useConversations,
  useMessages,
  useSendSms,
  useContacts,
  useUpsertContact,
  useDeleteContact,
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  useMessageMedia,
  type Conversation,
  type SmsMessage,
  type SmsTemplate,
} from '@/hooks/use-sms';

/* -------------------------------------------------- */
/*  Constants                                          */
/* -------------------------------------------------- */

const SMS_SEGMENT = 160;
// IIS default requestFiltering limit is ~200KB payload; base64 adds ~33% overhead.
// Target ≤130KB raw image so the base64 JSON stays well under 200KB.
const MAX_MEDIA_BYTES = 130 * 1024; // 130 KB raw → ~173 KB base64 + JSON overhead
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(dateStr);
}

function dateSeparatorLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function smsSegmentInfo(text: string) {
  const chars = text.length;
  return { chars, segments: chars === 0 ? 1 : Math.ceil(chars / SMS_SEGMENT) };
}

type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | null;

function DeliveryIcon({ status }: { status: DeliveryStatus }) {
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5" style={{ color: '#00d4ff' }} />;
  if (status === 'sent') return <Check className="h-3.5 w-3.5" style={{ color: '#ffffff' }} />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5" style={{ color: '#ef4444' }} />;
  if (status === null) return null;
  return <Clock className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />;
}

/* -------------------------------------------------- */
/*  MediaBubble — lazy-loads image/PDF on demand       */
/* -------------------------------------------------- */

function MediaBubble({ messageId, mediaType, mediaName, isOutbound }: {
  messageId: number;
  mediaType: string;
  mediaName: string | null;
  isOutbound: boolean;
}) {
  const [show, setShow] = useState(false);
  const { data, isLoading } = useMessageMedia(show ? messageId : null);

  const isPdf = mediaType.includes('pdf');
  const color = isOutbound ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)';

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className="mt-1 flex items-center gap-1.5 text-xs underline"
        style={{ color }}
      >
        {isPdf ? <FileText className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
        {mediaName ?? (isPdf ? 'Open PDF' : 'View image')}
      </button>
    );
  }

  if (isLoading) return <Loader2 className="mt-1 h-4 w-4 animate-spin" style={{ color }} />;
  if (!data) return null;

  if (isPdf) {
    return (
      <a
        href={`data:${data.type};base64,${data.data}`}
        download={data.name ?? 'document.pdf'}
        className="mt-1 flex items-center gap-1.5 text-xs underline"
        style={{ color }}
      >
        <FileText className="h-3.5 w-3.5" />
        {data.name ?? 'Download PDF'}
      </a>
    );
  }

  return (
    <img
      src={`data:${data.type};base64,${data.data}`}
      alt={data.name ?? 'Image'}
      className="mt-1 max-w-[200px] rounded-lg"
    />
  );
}

/* -------------------------------------------------- */
/*  Main Page                                          */
/* -------------------------------------------------- */

export default function SmsPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [showThreadSearch, setShowThreadSearch] = useState(false);

  // Contact name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Template picker
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateBody, setNewTemplateBody] = useState('');
  const [addingTemplate, setAddingTemplate] = useState(false);

  // MMS
  const [pendingMedia, setPendingMedia] = useState<{ data: string; type: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ---- Queries ---- */
  const { data: conversations, isLoading: loadingConversations } = useConversations();
  const { data: messages, isLoading: loadingMessages } = useMessages(selectedPhone);
  const { data: contacts = [] } = useContacts();
  const { data: templates = [] } = useTemplates();

  /* ---- Mutations ---- */
  const sendSms = useSendSms();
  const upsertContact = useUpsertContact();
  const deleteContact = useDeleteContact();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();

  /* ---- Contact name lookup ---- */
  const contactMap = new Map(contacts.map((c) => [c.phoneNumber, c.name]));
  const displayName = (phone: string) => contactMap.get(phone) ?? formatPhone(phone);

  /* ---- Auto-scroll ---- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ---- Send handler ---- */
  const handleSend = useCallback(() => {
    if (!selectedPhone || (!messageText.trim() && !pendingMedia)) return;
    sendSms.mutate(
      {
        phone: selectedPhone,
        body: messageText.trim(),
        ...(pendingMedia ? {
          mediaData: pendingMedia.data,
          mediaType: pendingMedia.type,
          mediaName: pendingMedia.name,
        } : {}),
      },
      {
        onSuccess: () => {
          setMessageText('');
          setPendingMedia(null);
        },
      },
    );
  }, [selectedPhone, messageText, pendingMedia, sendSms]);

  /* ---- New conversation ---- */
  const handleNewConversation = useCallback(() => {
    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) return;
    setSelectedPhone(digits);
    setNewDialogOpen(false);
    setNewPhone('');
  }, [newPhone]);

  /* ---- Key handler ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  /* ---- Save contact name ---- */
  const handleSaveName = useCallback(() => {
    if (!selectedPhone || !nameInput.trim()) return;
    upsertContact.mutate({ phone: selectedPhone, name: nameInput.trim() });
    setEditingName(false);
  }, [selectedPhone, nameInput, upsertContact]);

  /* ---- File picker (MMS) — compresses to fit IIS request limit ---- */
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert('Only images (JPEG, PNG, GIF, WebP) can be sent via MMS. PDFs are not supported.');
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      // Scale down if larger than 800px on longest side
      const MAX_DIM = 800;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      // Iteratively reduce quality until under MAX_MEDIA_BYTES
      let quality = 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > MAX_MEDIA_BYTES && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      const base64 = dataUrl.split(',')[1];
      setPendingMedia({ data: base64, type: 'image/jpeg', name: file.name.replace(/\.[^.]+$/, '.jpg') });
    };
    img.src = objectUrl;
  }, []);

  /* ---- Apply template ---- */
  const handleApplyTemplate = useCallback((tpl: SmsTemplate) => {
    setMessageText(tpl.body);
    setTemplateDialogOpen(false);
  }, []);

  /* ---- Filtered conversations ---- */
  const filteredConversations = conversations?.filter((c) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    const name = contactMap.get(c.phone)?.toLowerCase() ?? '';
    return (
      c.phone.includes(q) ||
      formatPhone(c.phone).toLowerCase().includes(q) ||
      c.lastMessage.toLowerCase().includes(q) ||
      name.includes(q)
    );
  });

  const selectedConversation = conversations?.find((c) => c.phone === selectedPhone);

  /* ---- Filtered messages (thread search) ---- */
  const filteredMessages = threadSearch
    ? messages?.filter((m) => m.body.toLowerCase().includes(threadSearch.toLowerCase()))
    : messages;

  /* ---- Date-grouped messages ---- */
  function buildMessageRows(msgs: SmsMessage[]) {
    const rows: Array<{ type: 'separator'; label: string } | { type: 'message'; msg: SmsMessage }> = [];
    let lastDay = '';
    for (const msg of msgs) {
      const day = new Date(msg.createdAt).toDateString();
      if (day !== lastDay) {
        rows.push({ type: 'separator', label: dateSeparatorLabel(msg.createdAt) });
        lastDay = day;
      }
      rows.push({ type: 'message', msg });
    }
    return rows;
  }

  return (
    <>
      <Header title="SMS Messages" />

      <div className="mx-auto max-w-[1600px] pt-6">
        <Card className="flex overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>

          {/* ============================================ */}
          {/*  LEFT PANEL - Conversation List              */}
          {/* ============================================ */}
          <div className="flex w-[340px] shrink-0 flex-col border-r" style={{ borderColor: 'var(--border)' }}>
            {/* Header bar */}
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Conversations
              </h2>
              <Button size="sm" variant="outline" onClick={() => setNewDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                New Message
              </Button>
            </div>

            {/* Search */}
            <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <Input
                  placeholder="Search conversations..."
                  className="pl-9"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {loadingConversations ? (
                <Loading className="py-12" />
              ) : !filteredConversations || filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-12">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                    <MessageSquare className="h-6 w-6" style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No conversations yet</p>
                  <p className="mt-1 text-center text-xs" style={{ color: 'var(--text-muted)' }}>Start a new message to begin</p>
                </div>
              ) : (
                filteredConversations.map((conv: Conversation) => {
                  const isActive = conv.phone === selectedPhone;
                  const name = displayName(conv.phone);
                  return (
                    <button
                      key={conv.phone}
                      type="button"
                      onClick={() => setSelectedPhone(conv.phone)}
                      className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: isActive ? 'rgba(0, 212, 255, 0.06)' : 'transparent',
                        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                      }}
                    >
                      <div
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-secondary)' }}
                      >
                        <Phone className="h-4 w-4" style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium" style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {name}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {conv.unread > 0 && (
                              <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ backgroundColor: '#ef4444' }}>
                                {conv.unread > 99 ? '99+' : conv.unread}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo(conv.lastMessageAt)}</span>
                          </div>
                        </div>
                        <p
                          className="mt-0.5 truncate text-xs"
                          style={{
                            color: conv.unread > 0 && !isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: conv.unread > 0 && !isActive ? 500 : 400,
                          }}
                        >
                          {conv.lastMessage}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ============================================ */}
          {/*  RIGHT PANEL - Message Thread                */}
          {/* ============================================ */}
          <div className="flex min-w-0 flex-1 flex-col">
            {!selectedPhone ? (
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                  <MessageSquare className="h-8 w-8" style={{ color: 'var(--accent)' }} />
                </div>
                <h3 className="mb-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Select a conversation</h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Choose a conversation from the list or start a new one.</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                    <Phone className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                          className="h-7 text-sm"
                          placeholder="Contact name..."
                        />
                        <Button size="sm" onClick={handleSaveName} disabled={upsertContact.isPending}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {displayName(selectedPhone)}
                        </p>
                        <button
                          type="button"
                          onClick={() => { setNameInput(contactMap.get(selectedPhone) ?? ''); setEditingName(true); }}
                          className="opacity-40 hover:opacity-100 transition-opacity"
                          title="Set contact name"
                        >
                          <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                        </button>
                        {contactMap.has(selectedPhone) && (
                          <button
                            type="button"
                            onClick={() => deleteContact.mutate(selectedPhone)}
                            className="opacity-40 hover:opacity-100 transition-opacity"
                            title="Remove contact name"
                          >
                            <Trash2 className="h-3.5 w-3.5" style={{ color: '#ef4444' }} />
                          </button>
                        )}
                      </div>
                    )}
                    {selectedConversation && !editingName && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatPhone(selectedPhone)} · Last active {timeAgo(selectedConversation.lastMessageAt)}
                      </p>
                    )}
                  </div>

                  {/* Thread search toggle */}
                  <button
                    type="button"
                    onClick={() => { setShowThreadSearch((v) => !v); setThreadSearch(''); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                    style={{ color: showThreadSearch ? 'var(--accent)' : 'var(--text-muted)', backgroundColor: showThreadSearch ? 'var(--accent-subtle)' : 'transparent' }}
                    title="Search in conversation"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>

                {/* Thread search bar */}
                {showThreadSearch && (
                  <div className="border-b px-4 py-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                      <Input
                        autoFocus
                        placeholder="Search messages..."
                        className="pl-9 pr-8"
                        value={threadSearch}
                        onChange={(e) => setThreadSearch(e.target.value)}
                      />
                      {threadSearch && (
                        <button type="button" onClick={() => setThreadSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                          <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                        </button>
                      )}
                    </div>
                    {threadSearch && (
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {filteredMessages?.length ?? 0} result{filteredMessages?.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {loadingMessages ? (
                    <Loading className="py-12" />
                  ) : !filteredMessages || filteredMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {threadSearch ? 'No messages match your search.' : 'No messages yet. Send one to start the conversation.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {buildMessageRows(filteredMessages).map((row, idx) => {
                        if (row.type === 'separator') {
                          return (
                            <div key={`sep-${idx}`} className="flex items-center gap-3 py-3">
                              <div className="h-px flex-1" style={{ backgroundColor: 'var(--border)' }} />
                              <span className="text-[11px] font-medium px-2" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                              <div className="h-px flex-1" style={{ backgroundColor: 'var(--border)' }} />
                            </div>
                          );
                        }

                        const { msg } = row;
                        const isOutbound = msg.direction === 'outbound';
                        return (
                          <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className="max-w-[70%] rounded-2xl px-4 py-2.5"
                              style={{
                                backgroundColor: isOutbound ? 'var(--accent)' : 'var(--bg-secondary)',
                                color: isOutbound ? 'var(--accent-contrast)' : 'var(--text-primary)',
                                borderBottomRightRadius: isOutbound ? '4px' : undefined,
                                borderBottomLeftRadius: !isOutbound ? '4px' : undefined,
                              }}
                            >
                              {msg.body && (
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                              )}
                              {msg.mediaType && (
                                <MediaBubble
                                  messageId={msg.id}
                                  mediaType={msg.mediaType}
                                  mediaName={msg.mediaName}
                                  isOutbound={isOutbound}
                                />
                              )}
                              <div
                                className="mt-1 flex items-center justify-end gap-1"
                                style={{ opacity: 0.85, color: isOutbound ? 'var(--accent-contrast)' : 'var(--text-muted)' }}
                              >
                                <span className="text-[10px]">{formatDateTime(msg.createdAt)}</span>
                                {isOutbound && <DeliveryIcon status={msg.status} />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Pending media preview */}
                {pendingMedia && (
                  <div className="border-t px-4 pt-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      {pendingMedia.type.startsWith('image/') ? (
                        <img src={`data:${pendingMedia.type};base64,${pendingMedia.data}`} alt="" className="h-12 w-12 rounded object-cover" />
                      ) : (
                        <FileText className="h-8 w-8 shrink-0" style={{ color: 'var(--accent)' }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{pendingMedia.name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{pendingMedia.type}</p>
                      </div>
                      <button type="button" onClick={() => setPendingMedia(null)}>
                        <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Input bar */}
                <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-end gap-2">
                    {/* Attach file */}
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFileSelect} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--accent-subtle)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                      title="Attach image (JPEG/PNG/GIF)"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>

                    {/* Templates */}
                    <button
                      type="button"
                      onClick={() => setTemplateDialogOpen(true)}
                      className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--accent-subtle)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                      title="Use a template"
                    >
                      <LayoutTemplate className="h-4 w-4" />
                    </button>

                    <div className="flex flex-1 flex-col gap-1">
                      <textarea
                        placeholder="Type a message..."
                        rows={1}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
                        style={{ maxHeight: '120px' }}
                      />
                      {messageText.length > 0 && (() => {
                        const { chars, segments } = smsSegmentInfo(messageText);
                        const nearLimit = chars % SMS_SEGMENT >= 140;
                        return (
                          <p className="text-right text-[10px]" style={{ color: nearLimit ? '#f59e0b' : 'var(--text-muted)' }}>
                            {chars}/{segments * SMS_SEGMENT}{segments > 1 && ` · ${segments} SMS`}
                          </p>
                        );
                      })()}
                    </div>

                    <Button
                      onClick={handleSend}
                      disabled={(!messageText.trim() && !pendingMedia) || sendSms.isPending}
                    >
                      {sendSms.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ---- New Conversation Dialog ---- */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>Enter a phone number to start a new conversation.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="new-phone" className="mb-1.5 block text-xs">Phone Number</Label>
            <Input
              id="new-phone"
              type="tel"
              placeholder="(555) 555-5555"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNewConversation(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleNewConversation} disabled={newPhone.replace(/\D/g, '').length < 10}>
              <MessageSquare className="h-4 w-4" />
              Start Conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Template Picker Dialog ---- */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>SMS Templates</DialogTitle>
            <DialogDescription>Select a template or create a new one.</DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[300px] flex-col gap-1 overflow-y-auto py-1">
            {templates.length === 0 && !addingTemplate && (
              <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No templates yet.</p>
            )}
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="group flex items-start gap-2 rounded-lg px-3 py-2 cursor-pointer"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
                onClick={() => handleApplyTemplate(tpl)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tpl.title}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{tpl.body}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteTemplate.mutate(tpl.id); }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity [@media(hover:none)]:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" style={{ color: '#ef4444' }} />
                </button>
              </div>
            ))}
          </div>

          {addingTemplate ? (
            <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <Input
                autoFocus
                placeholder="Template title (e.g. Payment reminder)"
                value={newTemplateTitle}
                onChange={(e) => setNewTemplateTitle(e.target.value)}
              />
              <textarea
                placeholder="Template text..."
                rows={3}
                value={newTemplateBody}
                onChange={(e) => setNewTemplateBody(e.target.value)}
                className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setAddingTemplate(false); setNewTemplateTitle(''); setNewTemplateBody(''); }}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={!newTemplateTitle.trim() || !newTemplateBody.trim() || createTemplate.isPending}
                  onClick={() => {
                    createTemplate.mutate(
                      { title: newTemplateTitle.trim(), body: newTemplateBody.trim() },
                      { onSuccess: () => { setAddingTemplate(false); setNewTemplateTitle(''); setNewTemplateBody(''); } },
                    );
                  }}
                >
                  {createTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Save Template
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAddingTemplate(true)}>
                <Plus className="h-4 w-4" />
                New Template
              </Button>
              <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Close</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
