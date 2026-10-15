import {
  BONUS_FIELDS,
  PERIOD_BONUS_FIELDS,
  isDatedBonus,
  type BonusFieldKey,
  type DatedBonusCategory,
  type PeriodBonusField,
} from '@/lib/payroll/constants';

export interface ReportTotalsInput {
  /** The period's paid hours from the timesheet (undefined until it loads). */
  totals: { totalHours: number; overtime: number } | undefined;
  payRateInput: string;
  otPayRateInput: string;
  /** What's typed for the bonuses that are one amount per period. */
  bonusInputs: Record<PeriodBonusField, string>;
  /** Saved dated entries (Wheel Spins, CCF Spiffs), summed per category. */
  datedTotals: Record<DatedBonusCategory, number>;
}

export interface ReportTotals {
  payRate: number | null;
  otPayRate: number | null;
  regularPay: number | null;
  hasOvertime: boolean;
  otRateMissing: boolean;
  otPay: number | null;
  bonusAmounts: Record<BonusFieldKey, number>;
  bonusTotal: number;
  totalPay: number | null;
}

/** The Payment Report's live pay calculation, from what's typed in the editors. */
export function computeReportTotals({
  totals,
  payRateInput,
  otPayRateInput,
  bonusInputs,
  datedTotals,
}: ReportTotalsInput): ReportTotals {
  // The rate used for the live calculation and for print comes from what's
  // currently typed, not from the saved record — so the total updates as
  // the admin types, before (or instead of) saving it.
  const parsedPayRate = payRateInput.trim() ? Number(payRateInput) : null;
  const parsedOtPayRate = otPayRateInput.trim() ? Number(otPayRateInput) : null;
  const payRate = parsedPayRate != null && !isNaN(parsedPayRate) && parsedPayRate >= 0 ? parsedPayRate : null;
  const otPayRate = parsedOtPayRate != null && !isNaN(parsedOtPayRate) && parsedOtPayRate >= 0 ? parsedOtPayRate : null;
  // Same math and rounding as computePayStatement on the server, so the PDF
  // matches what Payroll will snapshot on approval: each component rounded
  // to cents, and overtime with no OT rate paid as $0 (flagged below) rather
  // than hiding the whole summary.
  const cents = (n: number) => Math.round(n * 100) / 100;
  const regularPay = payRate != null && totals ? cents(totals.totalHours * payRate) : null;
  const hasOvertime = (totals?.overtime ?? 0) > 0;
  const otRateMissing = hasOvertime && otPayRate == null;
  const otPay = totals ? (hasOvertime && otPayRate != null ? cents(totals.overtime * otPayRate) : 0) : null;
  // Bonus/incentive categories: manually-entered dollar amounts, not computed
  // from any formula — kept separate from the hourly/OT math and summed in.
  const typed = Object.fromEntries(
    PERIOD_BONUS_FIELDS.map((key) => {
      const raw = bonusInputs[key].trim() ? Number(bonusInputs[key]) : null;
      return [key, raw != null && !isNaN(raw) && raw >= 0 ? raw : 0];
    }),
  ) as Record<PeriodBonusField, number>;
  const bonusAmounts = Object.fromEntries(
    BONUS_FIELDS.map((key) => [key, isDatedBonus(key) ? datedTotals[key] : typed[key]]),
  ) as Record<BonusFieldKey, number>;
  const bonusTotal = cents(BONUS_FIELDS.reduce((sum, key) => sum + bonusAmounts[key], 0));
  const totalPay = regularPay != null && otPay != null ? cents(regularPay + otPay + bonusTotal) : null;

  return { payRate, otPayRate, regularPay, hasOvertime, otRateMissing, otPay, bonusAmounts, bonusTotal, totalPay };
}
