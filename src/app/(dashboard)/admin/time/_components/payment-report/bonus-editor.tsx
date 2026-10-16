'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import type { BonusEntry } from '@/hooks/use-admin-time';
import {
  BONUS_FIELD_LABELS,
  DATED_BONUS_CATEGORIES,
  PERIOD_BONUS_FIELDS,
  isCountedBonus,
  type CountedBonusField,
  type PeriodBonusField,
} from '@/lib/payroll/constants';
import { DatedBonusList } from './dated-bonus-list';

interface BonusEditorProps {
  bonusInputs: Record<PeriodBonusField, string>;
  setBonusInputs: Dispatch<SetStateAction<Record<PeriodBonusField, string>>>;
  /** How many accounts / verified leads (printed as "Accounts (4)"). */
  countInputs: Record<CountedBonusField, string>;
  setCountInputs: Dispatch<SetStateAction<Record<CountedBonusField, string>>>;
  bonusIsDirty: boolean;
  bonusLoading: boolean;
  handleSaveBonus: () => void;
  saveBonus: { isPending: boolean; error: Error | null };
  /** For the dated bonuses (Wheel Spins, CCF Spiffs), which save on their own. */
  userId: number;
  bonusEntries: BonusEntry[];
  /** Workdays of the period that have already happened. */
  bonusDays: string[];
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
  bonusIsDirty,
  bonusLoading,
  handleSaveBonus,
  saveBonus,
  userId,
  bonusEntries,
  bonusDays,
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
        {PERIOD_BONUS_FIELDS.map((key) => (
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

      {/* Earned on specific days: each entry has its own date and amount and is
          saved as soon as it's added (no Save Bonuses needed). */}
      <div className="grid gap-3 sm:grid-cols-2">
        {DATED_BONUS_CATEGORIES.map((category) => (
          <DatedBonusList
            key={category}
            userId={userId}
            category={category}
            entries={bonusEntries.filter((e) => e.category === category)}
            days={bonusDays}
            locked={locked}
          />
        ))}
      </div>
    </div>
  );
}
