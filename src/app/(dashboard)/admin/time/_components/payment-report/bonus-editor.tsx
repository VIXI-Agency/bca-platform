'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import { BONUS_FIELDS, BONUS_FIELD_LABELS, type BonusFieldKey } from '@/lib/payroll/constants';

interface BonusEditorProps {
  bonusInputs: Record<BonusFieldKey, string>;
  setBonusInputs: Dispatch<SetStateAction<Record<BonusFieldKey, string>>>;
  bonusIsDirty: boolean;
  bonusLoading: boolean;
  handleSaveBonus: () => void;
  saveBonus: { isPending: boolean; error: Error | null };
}

/** The per-period bonus/incentive inputs (hidden in print). */
export function BonusEditor({
  bonusInputs,
  setBonusInputs,
  bonusIsDirty,
  bonusLoading,
  handleSaveBonus,
  saveBonus,
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
        {BONUS_FIELDS.map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`report-bonus-${key}`} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {BONUS_FIELD_LABELS[key]}
            </Label>
            <Input
              id={`report-bonus-${key}`}
              type="number"
              min="0"
              step="0.01"
              className="h-8"
              value={bonusInputs[key]}
              onChange={(e) => setBonusInputs((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder="0.00"
              disabled={bonusLoading}
            />
          </div>
        ))}
      </div>
      {saveBonus.error && <p className="text-xs text-red-500">{saveBonus.error.message}</p>}
    </div>
  );
}
