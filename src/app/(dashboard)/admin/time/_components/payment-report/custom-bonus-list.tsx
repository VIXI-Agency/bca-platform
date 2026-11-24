'use client';

import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import { useAddCustomBonus, useRemoveCustomBonus, type CustomBonus } from '@/hooks/use-admin-time';
import { formatCurrency } from '@/lib/utils';
import {
  CUSTOM_BONUS_MAX_PER_PERIOD,
  CUSTOM_BONUS_NAME_MAX,
  customBonusRuleError,
  normalizeBonusName,
} from '@/lib/payroll/constants';

interface CustomBonusListProps {
  userId: number;
  /** The selected pay period (its first day). */
  week: string;
  /** The period's saved custom bonuses. */
  bonuses: CustomBonus[];
  /** Names used before, most used first. */
  suggestions: string[];
  locked: boolean;
}

/**
 * Bonuses payroll names itself ("Raffle", "Birthday Bonus"): one row per
 * bonus, each with the name typed and a dollar amount. The name box offers
 * the names used before, so the same bonus is spelled the same way.
 */
export function CustomBonusList({ userId, week, bonuses, suggestions, locked }: CustomBonusListProps) {
  const addBonus = useAddCustomBonus();
  const removeBonus = useRemoveCustomBonus();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const listId = useId();

  const full = bonuses.length >= CUSTOM_BONUS_MAX_PER_PERIOD;
  const cleanName = normalizeBonusName(name);
  const parsedAmount = Number(amount);
  const amountOk = amount.trim() !== '' && !isNaN(parsedAmount) && parsedAmount > 0;
  const ruleError = cleanName ? customBonusRuleError(cleanName, bonuses.map((b) => b.name)) : null;

  async function handleAdd() {
    try {
      await addBonus.mutateAsync({ userId, period: week, name: cleanName, amount: Math.round(parsedAmount * 100) / 100 });
      setName('');
      setAmount('');
    } catch {
      /* shown below from addBonus.error */
    }
  }

  async function handleRemove(id: number) {
    try {
      await removeBonus.mutateAsync({ id });
    } catch {
      /* shown below from removeBonus.error */
    }
  }

  const error = addBonus.error?.message ?? removeBonus.error?.message ?? ruleError;

  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Custom Bonuses
        </Label>
        <span className="text-xs" style={{ color: full ? 'var(--warning)' : 'var(--text-muted)' }}>
          {bonuses.length} of {CUSTOM_BONUS_MAX_PER_PERIOD}
        </span>
      </div>

      {bonuses.length > 0 && (
        <ul className="space-y-1">
          {bonuses.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <span className="min-w-0 break-words">{b.name}</span>
              <span className="ml-auto font-medium tabular-nums">{formatCurrency(b.amount)}</span>
              {!locked && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[var(--danger)] hover:text-[var(--danger)]"
                  onClick={() => handleRemove(b.id)}
                  disabled={removeBonus.isPending}
                  aria-label={`Remove ${b.name}`}
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
          <Input
            type="text"
            list={listId}
            maxLength={CUSTOM_BONUS_NAME_MAX}
            className="h-8 min-w-0 flex-1 basis-32"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bonus name..."
            aria-label="Custom bonus name"
            autoComplete="off"
          />
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Input
            type="number"
            min="0"
            step="0.01"
            className="h-8 w-24"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-label="Custom bonus amount"
          />
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleAdd} disabled={!cleanName || !amountOk || !!ruleError || addBonus.isPending}>
            {addBonus.isPending ? <Loading size="sm" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
