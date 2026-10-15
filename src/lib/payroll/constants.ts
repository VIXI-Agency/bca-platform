// Client-safe payroll constants — no Prisma import, so these can be used from
// 'use client' hooks/components as well as server routes and src/lib/payroll/compute.ts.

/** Every bonus category, in the order the report and statements list them. */
export const BONUS_FIELDS = [
  'discretionaryBonus',
  'collectionsBonus',
  'trainingBonus',
  'managerBonus',
  'wheelSpins',
  'ccfSpiffs',
  'accounts',
  'reloads',
  'verifiedLeads',
] as const;

export type BonusFieldKey = (typeof BONUS_FIELDS)[number];

/** Bonuses earned on a specific day: each entry has its own date and amount. */
export const DATED_BONUS_CATEGORIES = ['wheelSpins', 'ccfSpiffs'] as const;
export type DatedBonusCategory = (typeof DATED_BONUS_CATEGORIES)[number];

/** Bonuses typed as one amount per pay period (a PayrollBonuses column each). */
export const PERIOD_BONUS_FIELDS = [
  'discretionaryBonus',
  'collectionsBonus',
  'trainingBonus',
  'managerBonus',
  'accounts',
  'reloads',
  'verifiedLeads',
] as const;
export type PeriodBonusField = (typeof PERIOD_BONUS_FIELDS)[number];

/**
 * Per-period bonuses that also record how many there were ("Accounts (4)").
 * The count is informational: the amount typed is what's paid.
 */
export const COUNTED_BONUS_FIELDS = ['accounts', 'verifiedLeads'] as const;
export type CountedBonusField = (typeof COUNTED_BONUS_FIELDS)[number];

/** Where each counted bonus keeps its count (API field = PayrollBonuses column). */
export const BONUS_COUNT_KEYS = {
  accounts: 'accountsCount',
  verifiedLeads: 'verifiedLeadsCount',
} as const satisfies Record<CountedBonusField, string>;
export type BonusCountKey = (typeof BONUS_COUNT_KEYS)[CountedBonusField];

export const isCountedBonus = (key: string): key is CountedBonusField =>
  (COUNTED_BONUS_FIELDS as readonly string[]).includes(key);

/**
 * The count shown next to a counted bonus: what was typed, or 1 when only an
 * amount was entered. No amount means no bonus, so no count either.
 */
export function bonusCount(count: number | null | undefined, amount: number): number | null {
  if (!(amount > 0)) return null;
  return count != null && count > 0 ? count : 1;
}

/**
 * Caps per pay period (Friday–Thursday). Wheel Spins can land on the same
 * day; a CCF Spiff is daily, so at most one per day.
 */
export const DATED_BONUS_RULES: Record<DatedBonusCategory, { maxPerPeriod: number; onePerDay: boolean }> = {
  wheelSpins: { maxPerPeriod: 2, onePerDay: false },
  ccfSpiffs: { maxPerPeriod: 5, onePerDay: true },
};

export const isDatedBonus = (key: string): key is DatedBonusCategory =>
  (DATED_BONUS_CATEGORIES as readonly string[]).includes(key);

export const BONUS_FIELD_LABELS: Record<BonusFieldKey, string> = {
  discretionaryBonus: 'Discretionary Bonus',
  collectionsBonus: 'Collections Bonus',
  trainingBonus: 'Training Bonus',
  managerBonus: 'Manager Bonus',
  wheelSpins: 'Wheel Spins',
  ccfSpiffs: 'CCF Spiffs',
  accounts: 'Accounts',
  reloads: 'Reloads Spiffs',
  verifiedLeads: 'Verified Leads',
};

/** Why a new dated entry would break its category's rules, or null if it fits. */
export function datedBonusRuleError(
  category: DatedBonusCategory,
  entryDate: string,
  existing: { category: string; entryDate: string }[],
): string | null {
  const rule = DATED_BONUS_RULES[category];
  const same = existing.filter((e) => e.category === category);
  const label = BONUS_FIELD_LABELS[category];
  if (same.length >= rule.maxPerPeriod) {
    return `${label}: at most ${rule.maxPerPeriod} per pay period.`;
  }
  if (rule.onePerDay && same.some((e) => e.entryDate === entryDate)) {
    return `${label}: only one per day.`;
  }
  return null;
}

export const PAY_RUN_STATUSES = ['approved', 'paid', 'void'] as const;
export type PayRunStatus = (typeof PAY_RUN_STATUSES)[number];

export const PAY_STATEMENT_STATUSES = ['pending', 'paid', 'void'] as const;
export type PayStatementStatus = (typeof PAY_STATEMENT_STATUSES)[number];

// Starter list — the business can tell us if more are needed; this isn't
// validated against an external payment processor, just a label on the record.
export const PAYMENT_METHODS = ['direct_deposit', 'wire', 'zelle', 'cash', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  direct_deposit: 'Direct Deposit',
  wire: 'Wire Transfer',
  zelle: 'Zelle',
  cash: 'Cash',
  other: 'Other',
};
