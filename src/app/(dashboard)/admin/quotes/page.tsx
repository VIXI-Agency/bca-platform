'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, Pencil, Trash2, Quote } from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  useQuotes,
  useCreateQuote,
  useUpdateQuote,
  useDeleteQuote,
  type Quote as QuoteType,
} from '@/hooks/use-quotes';

export default function QuotesPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;

  const { data: quotes, isLoading } = useQuotes();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<QuoteType | null>(null);
  const [deletingQuote, setDeletingQuote] = useState<QuoteType | null>(null);
  const [quoteText, setQuoteText] = useState('');

  // Only admins should access this page
  if (userRole !== 1) {
    return (
      <>
        <Header title="Quotes" />
        <div className="flex items-center justify-center pt-20">
          <p style={{ color: 'var(--text-secondary)' }}>
            You do not have permission to access this page.
          </p>
        </div>
      </>
    );
  }

  function openAddDialog() {
    setEditingQuote(null);
    setQuoteText('');
    setDialogOpen(true);
  }

  function openEditDialog(quote: QuoteType) {
    setEditingQuote(quote);
    setQuoteText(quote.quote);
    setDialogOpen(true);
  }

  function openDeleteDialog(quote: QuoteType) {
    setDeletingQuote(quote);
    setDeleteDialogOpen(true);
  }

  async function handleSave() {
    if (!quoteText.trim()) return;

    if (editingQuote) {
      await updateQuote.mutateAsync({ id: editingQuote.id, quote: quoteText.trim() });
    } else {
      await createQuote.mutateAsync({ quote: quoteText.trim() });
    }

    setDialogOpen(false);
    setQuoteText('');
    setEditingQuote(null);
  }

  async function handleDelete() {
    if (!deletingQuote) return;
    await deleteQuote.mutateAsync(deletingQuote.id);
    setDeleteDialogOpen(false);
    setDeletingQuote(null);
  }

  const isSaving = createQuote.isPending || updateQuote.isPending;

  return (
    <>
      <Header title="Quotes" />

      <div className="mx-auto max-w-4xl space-y-6 pt-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Manage Quotes
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Quotes are shown on the dashboard as the quote of the day.
            </p>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4" />
            Add Quote
          </Button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loading />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!quotes || quotes.length === 0) && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <Quote className="h-7 w-7" style={{ color: 'var(--accent)' }} />
              </div>
              <p
                className="mb-1 text-base font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                No quotes yet
              </p>
              <p
                className="mb-4 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Add your first motivational quote for the team.
              </p>
              <Button onClick={openAddDialog} size="sm">
                <Plus className="h-4 w-4" />
                Add Quote
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quotes list */}
        {quotes && quotes.length > 0 && (
          <div className="space-y-3">
            {quotes.map((q) => (
              <Card key={q.id} className="group">
                <CardContent className="flex items-start gap-4 py-4">
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: 'var(--accent-subtle)' }}
                  >
                    <Quote
                      className="h-4 w-4"
                      style={{ color: 'var(--accent)' }}
                    />
                  </div>
                  <p
                    className="flex-1 pt-1 text-sm leading-relaxed italic"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    &ldquo;{q.quote}&rdquo;
                  </p>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(q)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[var(--danger)] hover:text-[var(--danger)]"
                      onClick={() => openDeleteDialog(q)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingQuote ? 'Edit Quote' : 'Add Quote'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="quote-text">Quote</Label>
              <textarea
                id="quote-text"
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                rows={4}
                placeholder="Enter a motivational quote..."
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
              disabled={!quoteText.trim() || isSaving}
            >
              {isSaving ? (
                <>
                  <Loading size="sm" />
                  Saving...
                </>
              ) : editingQuote ? (
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
            <DialogTitle>Delete Quote</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to delete this quote? This action cannot be
            undone.
          </p>
          {deletingQuote && (
            <div
              className="rounded-lg border border-[var(--border)] p-3 text-sm italic"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              &ldquo;{deletingQuote.quote}&rdquo;
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteQuote.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteQuote.isPending}
            >
              {deleteQuote.isPending ? (
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
