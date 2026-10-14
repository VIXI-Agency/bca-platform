import type { QueryClient } from '@tanstack/react-query';

/**
 * Every cached view derived from hours, pay rates, bonuses, disconnections or
 * pay-run status: Edit Time, the Audit Log and Payment Report (all read
 * 'admin-timesheet'), Time History, the Payroll page and Payment History.
 * Changing any input changes several of them, so every mutation that touches
 * pay refreshes them all rather than guessing which ones.
 */
const PAY_DATA_KEYS = [
  ['admin-timesheet'],
  ['admin-time-history'],
  ['admin-disconnections'],
  ['admin-bonus'],
  ['admin-time-employees'],
  ['payroll-run'],
  ['payroll-history'],
  ['payroll-employees'],
];

export function invalidatePayData(qc: QueryClient): void {
  for (const queryKey of PAY_DATA_KEYS) {
    qc.invalidateQueries({ queryKey });
  }
}
