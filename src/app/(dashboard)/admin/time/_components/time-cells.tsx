'use client';

import { Pencil, AlertTriangle } from 'lucide-react';

/* -------------------------------------------------- */
/*  Timesheet cell components                          */
/* -------------------------------------------------- */

export function TimeCell({
  value,
  modified,
  onClick,
}: {
  value: string;
  modified: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group/cell inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-[var(--accent-subtle)]"
      style={{ color: 'var(--text-primary)' }}
    >
      {value}
      {modified && (
        <Pencil
          className="h-3 w-3 shrink-0"
          style={{ color: 'var(--accent)' }}
          aria-label="Modified by admin"
        />
      )}
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/cell:opacity-40" />
    </button>
  );
}

export function BreakCell({
  outValue,
  inValue,
  duration,
  exceeded,
  modifiedOut,
  modifiedIn,
  onClickOut,
  onClickIn,
}: {
  outValue: string;
  inValue: string;
  duration: string;
  exceeded: boolean;
  modifiedOut: boolean;
  modifiedIn: boolean;
  onClickOut: () => void;
  onClickIn: () => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
        <button
          onClick={onClickOut}
          className="rounded px-1 transition-colors hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)]"
        >
          {outValue}
          {modifiedOut && (
            <Pencil
              className="ml-0.5 inline h-2.5 w-2.5"
              style={{ color: 'var(--accent)' }}
            />
          )}
        </button>
        <span>-</span>
        <button
          onClick={onClickIn}
          className="rounded px-1 transition-colors hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)]"
        >
          {inValue}
          {modifiedIn && (
            <Pencil
              className="ml-0.5 inline h-2.5 w-2.5"
              style={{ color: 'var(--accent)' }}
            />
          )}
        </button>
      </div>
      <span
        className={`text-xs font-medium ${
          exceeded
            ? 'rounded bg-red-500/10 px-1.5 py-0.5 text-red-400'
            : 'text-[var(--text-secondary)]'
        }`}
      >
        {duration}
        {exceeded && (
          <AlertTriangle className="ml-1 inline h-3 w-3 text-red-400" />
        )}
      </span>
    </div>
  );
}
