// Client-safe payroll constants — no Prisma import, so these can be used from
// 'use client' hooks/components as well as server routes and src/lib/payroll/compute.ts.

export const BONUS_FIELDS = [
  'discretionaryBonus',
  'collectionsBonus',
  'trainingBonus',
  'managerBonus',
  'wheelSpins',
  'accounts',
  'reloads',
  'verifiedLeads',
] as const;

export type BonusFieldKey = (typeof BONUS_FIELDS)[number];

export const BONUS_FIELD_LABELS: Record<BonusFieldKey, string> = {
  discretionaryBonus: 'Discretionary Bonus',
  collectionsBonus: 'Collections Bonus',
  trainingBonus: 'Training Bonus',
  managerBonus: 'Manager Bonus',
  wheelSpins: 'Wheel Spins',
  accounts: 'Accounts',
  reloads: 'Reloads',
  verifiedLeads: 'Verified Leads',
};

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
