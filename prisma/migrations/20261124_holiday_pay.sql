-- Migration: Holiday Pay on the Payment Report. The admin types the hours being
-- paid and the app multiplies them by the employee's regular pay rate, so only
-- the hours are stored (whole hours, per employee per pay period).
-- Run once against production DB before deploying the matching app version.
-- Additive only: one nullable column; no existing row changes.

IF COL_LENGTH('benjaise_sqluser2.PayrollBonuses', 'HolidayHours') IS NULL
  ALTER TABLE benjaise_sqluser2.PayrollBonuses ADD HolidayHours INT NULL;
