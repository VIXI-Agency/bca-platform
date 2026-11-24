'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import type { BonusEntry } from '@/hooks/use-admin-time';
import {
  BONUS_FIELDS,
  BONUS_FIELD_LABELS,
  BONUS_NOTES_MAX,
  DATED_BONUS_CATEGORIES,
  DATED_BONUS_RULES,
  isCountedBonus,
  isDatedBonus,
  type CountedBonusField,
  type PeriodBonusField,
} from '@/lib/payroll/constants';
import { DatedBonusList } from './dated-bonus-list';

// Every bonus typed in this grid, in the order the report lists them. The
// dated ones (Holiday Pay, Wheel Spins, CCF Spiffs) have their own lists below.
const GRID_FIELDS = BONUS_FIELDS.filter((key) => !isDatedBonus(key)) as PeriodBonusField[];

interface BonusEditorProps {
  bonusInputs: Record<PeriodBonusField, string>;
  setBonusInputs: Dispatch<SetStateAction<Record<PeriodBonusField, string>>>;
  /** How many accounts / verified leads (printed as "Accounts (4)"). */
  countInputs: Record<CountedBonusField, string>;
  setCountInputs: Dispatch<SetStateAction<Record<CountedBonusField, string>>>;
  /** The regular rate as typed in the rate editor (null until one is entered). Holiday Pay is hours × this. */
  payRate: number | null;
  /** The week's note (saved with Save Bonuses, printed on the PDF). */
  notesInput: string;
  setNotesInput: (notes: string) => void;
  bonusIsDirty: boolean;
  bonusLoading: boolean;
  handleSaveBonus: () => void;
  saveBonus: { isPending: boolean; error: Error | null };
  /** For the dated bonuses (Holiday Pay, Wheel Spins, CCF Spiffs), which save on their own. */
  userId: number;
  bonusEntries: BonusEntry[];
  /** Workdays of the period that have already happened (Wheel Spins, CCF Spiffs). */
  bonusDays: string[];
  /** Every day of the period, weekends and upcoming days included (Holiday Pay). */
  periodDays: string[];
  locked: boolean;
}

/** A count was typed but no amount: the bonus isn't paid, so the count is never shown. */
const countWithoutAmount = (count: string, amount: string) =>
  count.trim() !== '' && Number(count) > 0 && !(Number(amount) > 0);

/** The per-period bonus/incentive inputs (hidden in print). */
export function BonusEditor({
  bonusInputs,
  setBonusInputs,
  countInputs,
  setCountInputs,
  payRate,
  notesInput,
  setNotesInput,
  bonusIsDirty,
  bonusLoading,
  handleSaveBonus,
  saveBonus,
  userId,
  bonusEntries,
  bonusDays,
  periodDays,
  locked,
}: BonusEditorProps) {
  return (
    <div
      className="no-print space-y-3 rounded-lg border p-3"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">Bonuses &amp; Incentives (optional, per pay period)</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSaveBonus}
          disabled={!bonusIsDirty || saveBonus.isPending || bonusLoading}
        >
          {saveBonus.isPending ? (
            <Loading size="sm" />
          ) : bonusIsDirty ? (
            'Save Bonuses'
          ) : (
            'Saved'
          )}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {GRID_FIELDS.map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`report-bonus-${key}`} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {BONUS_FIELD_LABELS[key]}
            </Label>
            <div className="flex gap-1">
              {isCountedBonus(key) && (
                <Input
                  aria-label={`How many ${BONUS_FIELD_LABELS[key]}`}
                  title={`How many ${BONUS_FIELD_LABELS[key].toLowerCase()} (blank = 1)`}
                  type="number"
                  min="0"
                  max="999"
                  step="1"
                  className="h-8 w-16 shrink-0"
                  value={countInputs[key]}
                  onChange={(e) => setCountInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder="#"
                  disabled={bonusLoading}
                />
              )}
              <Input
                id={`report-bonus-${key}`}
                type="number"
                min="0"
                step="0.01"
                className="h-8 min-w-0"
                value={bonusInputs[key]}
                onChange={(e) => setBonusInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="0.00"
                disabled={bonusLoading}
              />
            </div>
            {isCountedBonus(key) && countWithoutAmount(countInputs[key], bonusInputs[key]) && (
              <p className="text-[11px] text-amber-600">Add the $ amount, or it won&apos;t be paid or shown.</p>
            )}
          </div>
        ))}
      </div>
      {saveBonus.error && <p className="text-xs text-red-500">{saveBonus.error.message}</p>}

      {/* Entered for specific days: each entry has its own date and amount (or
          hours, for Holiday Pay) and is saved as soon as it's added (no Save
          Bonuses needed). */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DATED_BONUS_CATEGORIES.map((category) => (
          <DatedBonusList
            key={category}
            userId={userId}
            category={category}
            entries={bonusEntries.filter((e) => e.category === category)}
            days={DATED_BONUS_RULES[category].anyDay ? periodDays : bonusDays}
            payRate={payRate}
            locked={locked}
          />
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="report-notes" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Notes · printed on the employee&apos;s report
          </Label>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {notesInput.length} / {BONUS_NOTES_MAX}
          </span>
        </div>
        <textarea
          id="report-notes"
          rows={3}
          maxLength={BONUS_NOTES_MAX}
          value={notesInput}
          onChange={(e) => setNotesInput(e.target.value)}
          placeholder="Anything the employee should know about this week's pay"
          disabled={bonusLoading}
          className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
        />
      </div>
    </div>
  );
}
