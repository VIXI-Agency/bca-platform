-- Migration: how many accounts / verified leads a per-period bonus is for,
-- shown on the Payment Report as "Accounts (4) ... $15.00". Informational:
-- the typed amount is what's paid. A blank count with an amount shows (1).
-- Run once against production DB before deploying the matching app version.
-- Additive only: two nullable columns; no existing row changes.

IF COL_LENGTH('benjaise_sqluser2.PayrollBonuses', 'AccountsCount') IS NULL
  ALTER TABLE benjaise_sqluser2.PayrollBonuses ADD AccountsCount INT NULL;

IF COL_LENGTH('benjaise_sqluser2.PayrollBonuses', 'VerifiedLeadsCount') IS NULL
  ALTER TABLE benjaise_sqluser2.PayrollBonuses ADD VerifiedLeadsCount INT NULL;
