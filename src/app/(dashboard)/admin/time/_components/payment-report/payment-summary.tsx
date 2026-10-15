'use client';

import type { BonusEntry, WeekTotals } from '@/hooks/use-admin-time';
import { BONUS_FIELDS, BONUS_FIELD_LABELS, isDatedBonus, type BonusFieldKey } from '@/lib/payroll/constants';
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
  totalPay,
}: PaymentSummaryProps) {
  return (
    <div className="space-y-1 border-t pt-4 print:space-y-0 print:pt-[6px]" style={{ borderColor: 'var(--border)' }}>
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
        return [
          <div key={key} className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
            <span>{BONUS_FIELD_LABELS[key]}</span>
            <span>{formatCurrency(bonusAmounts[key])}</span>
          </div>,
        ];
      })}
      <div className="flex justify-between pt-2 text-base font-bold print:pt-[3px] print:text-[11px]" style={{ color: 'var(--text-primary)' }}>
        <span>Total Payment</span>
        <span>{formatCurrency(totalPay)}</span>
      </div>
    </div>
  );
}
