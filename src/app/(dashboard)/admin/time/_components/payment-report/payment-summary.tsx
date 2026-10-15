'use client';

import { BONUS_FIELDS, type BonusFieldKey, type WeekTotals } from '@/hooks/use-admin-time';
import { formatDuration } from '../../_lib/format';
import { BONUS_FIELD_LABELS, formatCurrency } from './labels';

interface PaymentSummaryProps {
  totals: WeekTotals | undefined;
  payRate: number | null;
  otPayRate: number | null;
  regularPay: number | null;
  otPay: number | null;
  otRateMissing: boolean;
  bonusAmounts: Record<BonusFieldKey, number>;
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
  totalPay,
}: PaymentSummaryProps) {
  return (
    <div className="space-y-1 border-t pt-4 print:space-y-0 print:pt-[6px]" style={{ borderColor: 'var(--border)' }}>
      <div className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
        <span>Regular ({formatDuration(Math.round((totals?.totalHours ?? 0) * 60))} × {formatCurrency(payRate!)})</span>
        <span>{formatCurrency(regularPay!)}</span>
      </div>
      {otPay! > 0 && (
        <div className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
          <span>Overtime ({formatDuration(Math.round((totals?.overtime ?? 0) * 60))} × {formatCurrency(otPayRate!)})</span>
          <span>{formatCurrency(otPay!)}</span>
        </div>
      )}
      {otRateMissing && (
        <div className="flex justify-between text-sm text-red-500 print:text-[9.5px]">
          <span>Overtime ({formatDuration(Math.round((totals?.overtime ?? 0) * 60))}) — not paid: no OT rate set</span>
          <span>{formatCurrency(0)}</span>
        </div>
      )}
      {BONUS_FIELDS.filter((key) => bonusAmounts[key] > 0).map((key) => (
        <div key={key} className="flex justify-between text-sm print:text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
          <span>{BONUS_FIELD_LABELS[key]}</span>
          <span>{formatCurrency(bonusAmounts[key])}</span>
        </div>
      ))}
      <div className="flex justify-between pt-2 text-base font-bold print:pt-[3px] print:text-[11px]" style={{ color: 'var(--text-primary)' }}>
        <span>Total Payment</span>
        <span>{formatCurrency(totalPay)}</span>
      </div>
    </div>
  );
}
