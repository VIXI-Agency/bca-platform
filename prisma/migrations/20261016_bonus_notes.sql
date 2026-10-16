-- Migration: a note per employee per pay week on the Payment Report, saved with
-- the bonuses and printed on the employee's PDF (up to 500 characters).
-- Run once against production DB before deploying the matching app version.
-- Additive only: one nullable column; no existing row changes.

IF COL_LENGTH('benjaise_sqluser2.PayrollBonuses', 'Notes') IS NULL
  ALTER TABLE benjaise_sqluser2.PayrollBonuses ADD Notes NVARCHAR(500) NULL;
