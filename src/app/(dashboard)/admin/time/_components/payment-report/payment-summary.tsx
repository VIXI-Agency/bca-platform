'use client';

import type { BonusEntry, WeekTotals } from '@/hooks/use-admin-time';
import {
  BONUS_FIELDS,
  BONUS_FIELD_LABELS,
  isCountedBonus,
  isDatedBonus,
  type BonusFieldKey,
  type CountedBonusField,
} from '@/lib/payroll/constants';
import { formatCurrency } from '@/lib/utils';

/** Pay is computed from hours rounded to 2 decimals per day, so the summary
 *  shows those hours ("20.14 h") — in minutes, its math wouldn't check out
 *  (20h 08m × $7.00 is $140.93, but the 20.14 h actually paid is $140.98). */
const hours = (h: number) => `${h.toFixed(2)} h`;

/** "Mon 10/12", the same day format as the report's table. */
const dayLabel = (date: string) => {
  const d = new Date(date + 'T00:00:00');
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`;
};

interface PaymentSummaryProps {
  totals: WeekTotals | undefined;
  payRate: number | null;
  otPayRate: number | null;
  regularPay: number | null;
  otPay: number | null;
  otRateMissing: boolean;
  bonusAmounts: Record<BonusFieldKey, number>;
  /** Dated bonuses (Wheel Spins, CCF Spiffs): printed one line per entry. */
  bonusEntries?: BonusEntry[];
  /** How many accounts / verified leads: printed as "Accounts (4)". */
  bonusCounts?: Partial<Record<CountedBonusField, number | null>>;
  /** The week's note, printed under the total. */
  notes?: string | null;
  totalPay: number;
}

/** Regular, overtime and bonus lines, and the total to pay. */
export function PaymentSummary({
  totals,
  payRate,
  otPayRate,
  regularPay,
  otPay,
  otRateMissing,
  bonusAmounts,
  bonusEntries = [],
  bonusCounts = {},
  notes,
  totalPay,
}: PaymentSummaryProps) {
  const note = notes?.trim();
  // On paper the note sits beside the totals, in the width their short lines
  // leave free, so it never adds height to the one-page report.
  return (
    <div
      className={`border-t pt-4 print:pt-[6px] ${note ? 'print:grid print:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] print:items-start print:gap-5' : ''}`}
      style={{ borderColor: 'var(--border)' }}
    >
    <div className="space-y-1 print:space-y-0">
      <div className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
        <span>Regular ({hours(totals?.totalHours ?? 0)} × {formatCurrency(payRate!)})</span>
        <span>{formatCurrency(regularPay!)}</span>
      </div>
      {otPay! > 0 && (
        <div className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
          <span>Overtime ({hours(totals?.overtime ?? 0)} × {formatCurrency(otPayRate!)})</span>
          <span>{formatCurrency(otPay!)}</span>
        </div>
      )}
      {otRateMissing && (
        <div className="flex justify-between text-sm text-red-500 print:text-[9.5px]">
          <span>Overtime ({hours(totals?.overtime ?? 0)}) — not paid: no OT rate set</span>
          <span>{formatCurrency(0)}</span>
        </div>
      )}
      {BONUS_FIELDS.flatMap((key) => {
        if (isDatedBonus(key)) {
          // One line per category listing every day and amount, so a full week
          // of spiffs doesn't push the printed report onto a second sheet.
          const entries = bonusEntries.filter((e) => e.category === key);
          if (entries.length === 0) return [];
          const detail = entries.map((e) => `${dayLabel(e.date)} ${formatCurrency(e.amount)}`).join(' · ');
          return [
            <div key={key} className="flex justify-between gap-4 text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
              <span>{`${BONUS_FIELD_LABELS[key]} — ${detail}`}</span>
              <span>{formatCurrency(bonusAmounts[key])}</span>
            </div>,
          ];
        }
        if (bonusAmounts[key] <= 0) return [];
        const count = isCountedBonus(key) ? bonusCounts[key] : null;
        return [
          <div key={key} className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
            <span>{count != null ? `${BONUS_FIELD_LABELS[key]} (${count})` : BONUS_FIELD_LABELS[key]}</span>
            <span>{formatCurrency(bonusAmounts[key])}</span>
          </div>,
        ];
      })}
      <div className="flex justify-between pt-2 text-base font-bold print:pt-[3px] print:text-[11px]" style={{ color: 'var(--text-primary)' }}>
        <span>Total Payment</span>
        <span>{formatCurrency(totalPay)}</span>
      </div>
    </div>
      {note && (
        <div className="mt-3 rounded-md border p-3 print:mt-0 print:border-0 print:p-0 print:text-[8px] print:leading-tight" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide print:mr-1 print:inline print:text-[7.5px]" style={{ color: 'var(--text-muted)' }}>
            Notes
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-sm print:mt-0 print:inline print:text-[8px] print:leading-tight" style={{ color: 'var(--text-primary)' }}>
            {note}
          </p>
        </div>
      )}
    </div>
  );
}
