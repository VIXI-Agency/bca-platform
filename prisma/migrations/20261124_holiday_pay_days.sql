-- Migration: Holiday Pay by day. Holiday Pay becomes a dated entry like Wheel
-- Spins and CCF Spiffs: the admin picks the day and types the hours paid for
-- it. A holiday entry stores its hours here and an Amount of 0, since the
-- dollars are hours x the employee's pay rate and are never stored.
-- Run once against production DB before deploying the matching app version.
-- No existing row changes: one nullable column, and the table's two CHECK
-- constraints are widened to let holiday rows in. Every existing row (Wheel
-- Spins, CCF Spiffs) satisfies the new constraints as it stands.
-- PayrollBonuses.HolidayHours (20261124_holiday_pay.sql) stays in place, unread.
-- Safe to re-run. The constraint steps use EXEC because they name the new
-- column, which does not exist yet when this batch is compiled.

IF COL_LENGTH('benjaise_sqluser2.PayrollBonusEntries', 'Hours') IS NULL
  ALTER TABLE benjaise_sqluser2.PayrollBonusEntries ADD Hours INT NULL;

-- 1. Category: also allow 'holidayPay'.
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = 'CK_PayrollBonusEntries_Category'
    AND parent_object_id = OBJECT_ID('benjaise_sqluser2.PayrollBonusEntries')
    AND definition NOT LIKE '%holidayPay%'
)
  ALTER TABLE benjaise_sqluser2.PayrollBonusEntries DROP CONSTRAINT CK_PayrollBonusEntries_Category;

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = 'CK_PayrollBonusEntries_Category'
    AND parent_object_id = OBJECT_ID('benjaise_sqluser2.PayrollBonusEntries')
)
  ALTER TABLE benjaise_sqluser2.PayrollBonusEntries
    ADD CONSTRAINT CK_PayrollBonusEntries_Category CHECK (Category IN ('wheelSpins', 'ccfSpiffs', 'holidayPay'));

-- 2. What an entry holds: dollars (Amount > 0, no hours) for Wheel Spins and
--    CCF Spiffs, exactly as before; hours (Hours > 0, Amount = 0) for Holiday Pay.
IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = 'CK_PayrollBonusEntries_Value'
    AND parent_object_id = OBJECT_ID('benjaise_sqluser2.PayrollBonusEntries')
)
  EXEC('ALTER TABLE benjaise_sqluser2.PayrollBonusEntries
    ADD CONSTRAINT CK_PayrollBonusEntries_Value CHECK (
      (Category = ''holidayPay'' AND Hours > 0 AND Amount = 0)
      OR (Category <> ''holidayPay'' AND Amount > 0 AND Hours IS NULL)
    )');

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = 'CK_PayrollBonusEntries_Amount'
    AND parent_object_id = OBJECT_ID('benjaise_sqluser2.PayrollBonusEntries')
)
  ALTER TABLE benjaise_sqluser2.PayrollBonusEntries DROP CONSTRAINT CK_PayrollBonusEntries_Amount;
