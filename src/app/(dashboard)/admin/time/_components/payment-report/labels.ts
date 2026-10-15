import type { BonusFieldKey } from '@/hooks/use-admin-time';

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

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
