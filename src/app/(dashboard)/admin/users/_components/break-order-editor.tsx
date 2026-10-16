'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  BREAK_KINDS,
  BREAK_LABELS,
  DEFAULT_BREAK_ORDER,
  PART_TIME_BREAK_ORDER,
  moveBreak,
  toggleBreak,
  type BreakKind,
} from '@/lib/clock/break-order';

interface BreakOrderEditorProps {
  /** The saved order, or null while the user is on the default. */
  value: BreakKind[] | null;
  isPartTime: boolean;
  onChange: (order: BreakKind[] | null) => void;
}

/** Which breaks this user takes on the clock, and in what order. */
export const BreakOrderEditor = ({ value, isPartTime, onChange }: BreakOrderEditorProps) => {
  const fallback = isPartTime ? PART_TIME_BREAK_ORDER : DEFAULT_BREAK_ORDER;
  const order = value ?? [...fallback];
  // Breaks that are on, in order, then the ones that are off.
  const rows = [...order, ...BREAK_KINDS.filter((k) => !order.includes(k))];

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Breaks
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {value == null
              ? `Default for ${isPartTime ? 'part-time: one break, no lunch' : 'full-time: break, lunch, break'}`
              : 'Custom order for this user, as the clock will ask for them'}
          </p>
        </div>
        {value != null && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Reset to default
          </Button>
        )}
      </div>
      <ol className="space-y-2">
        {rows.map((kind) => {
          const position = order.indexOf(kind);
          const on = position >= 0;
          return (
            <li key={kind} className="flex items-center gap-2">
              <span className="w-5 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {on ? `${position + 1}.` : ''}
              </span>
              <span className="flex-1 text-sm" style={{ color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {BREAK_LABELS[kind]}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Move ${BREAK_LABELS[kind]} earlier`}
                disabled={!on || position === 0}
                onClick={() => onChange(moveBreak(order, kind, -1))}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Move ${BREAK_LABELS[kind]} later`}
                disabled={!on || position === order.length - 1}
                onClick={() => onChange(moveBreak(order, kind, 1))}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Switch
                aria-label={`${BREAK_LABELS[kind]} on or off`}
                checked={on}
                onCheckedChange={() => onChange(toggleBreak(order, kind))}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
};
