'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAddBonusEntry, useRemoveBonusEntry, type BonusEntry } from '@/hooks/use-admin-time';
import { formatCurrency } from '@/lib/utils';
import {
  BONUS_FIELD_LABELS,
  BONUS_HOURS_MAX,
  DATED_BONUS_RULES,
  datedBonusRuleError,
  hoursBonusAmount,
  isHoursBonus,
  type DatedBonusCategory,
} from '@/lib/payroll/constants';
import { parseCount } from './totals';

interface DatedBonusListProps {
  userId: number;
  category: DatedBonusCategory;
  /** This category's saved entries for the period. */
  entries: BonusEntry[];
  /** The days an entry can go on (the category's rule decides which). */
  days: string[];
  /** The regular rate as typed in the rate editor; only Holiday Pay needs it. */
  payRate?: number | null;
  locked: boolean;
}

/** "Mon 10/12", the same day format as the report's table. */
const dayLabel = (date: string) => {
  const d = new Date(date + 'T00:00:00');
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * A bonus entered for specific days: one row per entry, each with its own date
 * and amount. Holiday Pay is typed in hours instead, and paid at the pay rate.
 */
export function DatedBonusList({ userId, category, entries, days, payRate = null, locked }: DatedBonusListProps) {
  const addEntry = useAddBonusEntry();
  const removeEntry = useRemoveBonusEntry();
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');

  const rule = DATED_BONUS_RULES[category];
  const label = BONUS_FIELD_LABELS[category];
  const existing = entries.map((e) => ({ category: e.category, entryDate: e.date }));
  const byHour = isHoursBonus(category);
  const full = rule.maxPerPeriod != null && entries.length >= rule.maxPerPeriod;
  // Days that can still take one (CCF Spiffs: one per day, so used days drop out).
  const usedDays = new Set(entries.map((e) => e.date));
  const openDays = rule.onePerDay ? days.filter((d) => !usedDays.has(d)) : days;
  const parsedAmount = Number(amount);
  // Hours are whole numbers; dollars can have cents.
  const typedHours = byHour ? parseCount(amount) : null;
  const amountOk = byHour
    ? typedHours != null && typedHours > 0
    : amount.trim() !== '' && !isNaN(parsedAmount) && parsedAmount > 0;
  const hoursInvalid = byHour && amount.trim() !== '' && typedHours == null;
  const noRate = byHour && payRate == null && (entries.length > 0 || amountOk);
  const ruleError = date ? datedBonusRuleError(category, date, existing) : null;

  async function handleAdd() {
    try {
      await addEntry.mutateAsync(
        byHour
          ? { userId, category, date, hours: typedHours! }
          : { userId, category, date, amount: Math.round(parsedAmount * 100) / 100 },
      );
      setDate('');
      setAmount('');
    } catch {
      /* shown below from addEntry.error */
    }
  }

  async function handleRemove(id: number) {
    try {
      await removeEntry.mutateAsync({ id });
    } catch {
      /* shown below from removeEntry.error */
    }
  }

  const error = addEntry.error?.message ?? removeEntry.error?.message ?? (date && ruleError) ?? null;

  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {label}
          {byHour ? ' (hours)' : ''}
        </Label>
        <span className="text-xs" style={{ color: full ? 'var(--warning)' : 'var(--text-muted)' }}>
          {rule.maxPerPeriod != null ? `${entries.length} of ${rule.maxPerPeriod}` : ''}
          {rule.maxPerPeriod != null && rule.onePerDay ? ' · ' : ''}
          {rule.onePerDay ? 'one per day' : ''}
        </span>
      </div>

      {entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <span>{dayLabel(e.date)}</span>
              {byHour && <span style={{ color: 'var(--text-muted)' }}>· {e.hours ?? 0} h</span>}
              <span className="ml-auto font-medium tabular-nums">
                {byHour ? (payRate != null ? formatCurrency(hoursBonusAmount(e.hours, payRate)) : '—') : formatCurrency(e.amount)}
              </span>
              {!locked && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[var(--danger)] hover:text-[var(--danger)]"
                  onClick={() => handleRemove(e.id)}
                  disabled={removeEntry.isPending}
                  aria-label={`Remove ${label} for ${dayLabel(e.date)}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!locked && !full && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={date} onValueChange={setDate}>
            <SelectTrigger className="h-8 w-32" aria-label={`${label} day`}>
              <SelectValue placeholder="Day..." />
            </SelectTrigger>
            <SelectContent>
              {openDays.map((d) => (
                <SelectItem key={d} value={d}>
                  {dayLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            max={byHour ? BONUS_HOURS_MAX : undefined}
            step={byHour ? '1' : '0.01'}
            className="h-8 w-24"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={byHour ? '0 h' : '0.00'}
            title={byHour ? 'Hours being paid for that day. The amount is hours × the pay rate.' : undefined}
            aria-label={byHour ? `${label} hours` : `${label} amount`}
          />
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleAdd} disabled={!date || !amountOk || !!ruleError || addEntry.isPending}>
            {addEntry.isPending ? <Loading size="sm" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>
      )}

      {hoursInvalid && <p className="text-[11px] text-amber-600">Whole hours only, up to {BONUS_HOURS_MAX}.</p>}
      {noRate && <p className="text-[11px] text-amber-600">Set a pay rate, or {label} won&apos;t be paid.</p>}
      {byHour && amountOk && payRate != null && !locked && (
        <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {typedHours} h × {formatCurrency(payRate)} = {formatCurrency(hoursBonusAmount(typedHours, payRate))}
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
