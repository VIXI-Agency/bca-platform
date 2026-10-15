import { payPeriodOptions } from '@/lib/time';

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

// Pay periods (Friday through Thursday) come from the same helper the
// Payroll page and the API use, so every screen agrees on which week is which.
export const generateWeekOptions = payPeriodOptions;
