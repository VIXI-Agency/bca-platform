'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import DOMPurify from 'isomorphic-dompurify';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useRebuttals,
  useCreateRebuttal,
  useUpdateRebuttal,
  useDeleteRebuttal,
  type Rebuttal,
} from '@/hooks/use-rebuttals';

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

export default function RebuttalsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;

  const { data: rebuttals, isLoading } = useRebuttals();
  const createRebuttal = useCreateRebuttal();
  const updateRebuttal = useUpdateRebuttal();
  const deleteRebuttal = useDeleteRebuttal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRebuttal, setEditingRebuttal] = useState<Rebuttal | null>(null);
  const [deletingRebuttal, setDeletingRebuttal] = useState<Rebuttal | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Only admins should access this page
  if (userRole !== 1) {
    return (
      <>
        <Header title="Rebuttals" />
        <div className="flex items-center justify-center pt-20">
          <p style={{ color: 'var(--text-secondary)' }}>
            You do not have permission to access this page.
          </p>
        </div>
      </>
    );
  }

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openAddDialog() {
    setEditingRebuttal(null);
    setTitle('');
    setContent('');
    setDialogOpen(true);
  }

  function openEditDialog(rebuttal: Rebuttal) {
    setEditingRebuttal(rebuttal);
    setTitle(rebuttal.title);
    setContent(rebuttal.content);
    setDialogOpen(true);
  }

  function openDeleteDialog(rebuttal: Rebuttal) {
    setDeletingRebuttal(rebuttal);
    setDeleteDialogOpen(true);
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;

    if (editingRebuttal) {
      await updateRebuttal.mutateAsync({
        id: editingRebuttal.idRebuttal,
        title: title.trim(),
        content: content.trim(),
      });
    } else {
      await createRebuttal.mutateAsync({
        title: title.trim(),
        content: content.trim(),
      });
    }

    setDialogOpen(false);
    setTitle('');
    setContent('');
    setEditingRebuttal(null);
  }

  async function handleDelete() {
    if (!deletingRebuttal) return;
    await deleteRebuttal.mutateAsync(deletingRebuttal.idRebuttal);
    setDeleteDialogOpen(false);
    setDeletingRebuttal(null);
  }

  const isSaving = createRebuttal.isPending || updateRebuttal.isPending;

  return (
    <>
      <Header title="Rebuttals" />

      <div className="mx-auto max-w-4xl space-y-6 pt-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Manage Rebuttals
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Rebuttals help your team handle objections effectively.
            </p>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4" />
            Add Rebuttal
          </Button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loading />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!rebuttals || rebuttals.length === 0) && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <FileText className="h-7 w-7" style={{ color: 'var(--accent)' }} />
              </div>
              <p
                className="mb-1 text-base font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                No rebuttals yet
              </p>
              <p
                className="mb-4 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Add rebuttals to help your team handle common objections.
              </p>
              <Button onClick={openAddDialog} size="sm">
                <Plus className="h-4 w-4" />
                Add Rebuttal
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Rebuttals list */}
        {rebuttals && rebuttals.length > 0 && (
          <div className="space-y-3">
            {rebuttals.map((r) => {
              const isExpanded = expandedIds.has(r.idRebuttal);
              return (
                <Card key={r.idRebuttal} className="group overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header row - clickable to expand */}
                    <div
                      className="flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-[var(--bg-primary)]"
                      onClick={() => toggleExpand(r.idRebuttal)}
                    >
                      <div
                        className="flex h-5 w-5 shrink-0 items-center justify-center"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>
                      <h3
                        className="flex-1 text-sm font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {decodeEntities(r.title)}
                      </h3>
                      <div
                        className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[var(--danger)] hover:text-[var(--danger)]"
                          onClick={() => openDeleteDialog(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Expandable content */}
                    {isExpanded && (
                      <div
                        className="border-t px-5 py-4 text-sm leading-relaxed"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {r.content.includes('<table') ? (
                          <div
                            className="overflow-x-auto"
                            suppressHydrationWarning
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.content) }}
                          />
                        ) : (
                          <span className="whitespace-pre-wrap">{stripHtml(r.content)}</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRebuttal ? 'Edit Rebuttal' : 'Add Rebuttal'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rebuttal-title">Title</Label>
              <Input
                id="rebuttal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Price Objection"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rebuttal-content">Content</Label>
              <textarea
                id="rebuttal-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                placeholder="Enter the rebuttal script or talking points..."
                className="flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!title.trim() || !content.trim() || isSaving}
            >
              {isSaving ? (
                <>
                  <Loading size="sm" />
                  Saving...
                </>
              ) : editingRebuttal ? (
                'Update'
              ) : (
                'Add'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rebuttal</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to delete this rebuttal? This action cannot be
            undone.
          </p>
          {deletingRebuttal && (
            <div
              className="rounded-lg border border-[var(--border)] p-3 text-sm font-medium"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {deletingRebuttal.title}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteRebuttal.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteRebuttal.isPending}
            >
              {deleteRebuttal.isPending ? (
                <>
                  <Loading size="sm" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
