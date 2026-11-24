import {
  BONUS_FIELDS,
  COUNTED_BONUS_FIELDS,
  HOURS_BONUS_FIELDS,
  PERIOD_BONUS_FIELDS,
  bonusCount,
  hoursBonusAmount,
  isDatedBonus,
  isHoursBonus,
  type BonusFieldKey,
  type CountedBonusField,
  type DatedBonusCategory,
  type HoursBonusField,
  type PeriodBonusField,
} from '@/lib/payroll/constants';

export interface ReportTotalsInput {
  /** The period's paid hours from the timesheet (undefined until it loads). */
  totals: { totalHours: number; overtime: number } | undefined;
  payRateInput: string;
  otPayRateInput: string;
  /** What's typed for the bonuses that are one amount per period. */
  bonusInputs: Record<PeriodBonusField, string>;
  /** What's typed in the # box of Accounts / Verified Leads. */
  countInputs?: Partial<Record<CountedBonusField, string>>;
  /** Saved dated entries (Wheel Spins, CCF Spiffs), summed per category. */
  datedTotals: Record<DatedBonusCategory, number>;
  /** Hours of the saved Holiday Pay entries, summed over the period. */
  datedHours?: Partial<Record<HoursBonusField, number>>;
  /** Amounts of the saved custom bonuses ("Raffle", "Birthday Bonus"). */
  customAmounts?: readonly number[];
}

export interface ReportTotals {
  payRate: number | null;
  otPayRate: number | null;
  regularPay: number | null;
  hasOvertime: boolean;
  otRateMissing: boolean;
  otPay: number | null;
  bonusAmounts: Record<BonusFieldKey, number>;
  /** How many accounts / verified leads to print (null when that bonus isn't paid). */
  bonusCounts: Record<CountedBonusField, number | null>;
  /** Holiday hours entered for the period (null when there are none). */
  bonusHours: Record<HoursBonusField, number | null>;
  bonusTotal: number;
  totalPay: number | null;
}

/** The Payment Report's live pay calculation, from what's typed in the editors. */
export function computeReportTotals({
  totals,
  payRateInput,
  otPayRateInput,
  bonusInputs,
  countInputs = {},
  datedTotals,
  datedHours = {},
  customAmounts = [],
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
  // Holiday Pay is entered per day in hours and paid at the regular rate being
  // typed above. Those hours stay out of the worked hours and of overtime.
  const bonusHours = Object.fromEntries(
    HOURS_BONUS_FIELDS.map((key) => [key, (datedHours[key] ?? 0) > 0 ? datedHours[key]! : null]),
  ) as Record<HoursBonusField, number | null>;
  const bonusAmounts = Object.fromEntries(
    BONUS_FIELDS.map((key) => {
      if (isHoursBonus(key)) return [key, hoursBonusAmount(bonusHours[key], payRate)];
      if (isDatedBonus(key)) return [key, datedTotals[key]];
      return [key, typed[key]];
    }),
  ) as Record<BonusFieldKey, number>;
  const bonusTotal = cents(
    BONUS_FIELDS.reduce((sum, key) => sum + bonusAmounts[key], 0) + customAmounts.reduce((sum, a) => sum + a, 0),
  );
  const bonusCounts = Object.fromEntries(
    COUNTED_BONUS_FIELDS.map((key) => [key, bonusCount(parseCount(countInputs[key]), bonusAmounts[key])]),
  ) as Record<CountedBonusField, number | null>;
  const totalPay = regularPay != null && otPay != null ? cents(regularPay + otPay + bonusTotal) : null;

  return { payRate, otPayRate, regularPay, hasOvertime, otRateMissing, otPay, bonusAmounts, bonusCounts, bonusHours, bonusTotal, totalPay };
}

/** A typed count as a whole number, or null when blank or not a valid count. */
export function parseCount(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
}
