-- Migration: dated bonus entries (Wheel Spins: up to 2 per pay period,
-- same day allowed; CCF Spiffs: up to 5 per pay period, one per day).
-- Run once against production DB before deploying the matching app version.
--
-- 1. Additive: creates PayrollBonusEntries.
-- 2. Copies every existing PayrollBonuses.WheelSpins amount into one entry
--    dated the period's Friday, so nobody's pay changes; admins then set the
--    real dates. The WheelSpins column is NOT cleared: the app version still
--    running before the deploy keeps reading it, and the new version ignores
--    it. Re-running the script copies nothing twice.

IF OBJECT_ID('benjaise_sqluser2.PayrollBonusEntries') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.PayrollBonusEntries (
    IdEntry     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayrollBonusEntries PRIMARY KEY,
    IdUser      INT NOT NULL,
    PeriodStart DATE NOT NULL,             -- the pay period's Friday
    Category    NVARCHAR(30) NOT NULL,     -- 'wheelSpins' | 'ccfSpiffs'
    EntryDate   DATE NOT NULL,             -- the workday the bonus was earned
    Amount      DECIMAL(10,2) NOT NULL,
    ModifiedBy  NVARCHAR(100) NULL,
    CreatedAt   DATETIME NOT NULL CONSTRAINT DF_PayrollBonusEntries_CreatedAt DEFAULT GETDATE(),
    CONSTRAINT FK_PayrollBonusEntries_User FOREIGN KEY (IdUser) REFERENCES dbo.Users (IdUser),
    CONSTRAINT CK_PayrollBonusEntries_Category CHECK (Category IN ('wheelSpins', 'ccfSpiffs')),
    CONSTRAINT CK_PayrollBonusEntries_Amount CHECK (Amount > 0)
  );

  CREATE INDEX IX_PayrollBonusEntries_User_Period
    ON benjaise_sqluser2.PayrollBonusEntries (IdUser, PeriodStart);
END
GO

INSERT INTO benjaise_sqluser2.PayrollBonusEntries (IdUser, PeriodStart, Category, EntryDate, Amount, ModifiedBy)
SELECT b.IdUser, b.PeriodStart, 'wheelSpins', b.PeriodStart, b.WheelSpins, 'migration 20261015'
FROM benjaise_sqluser2.PayrollBonuses b
WHERE b.WheelSpins > 0
  AND NOT EXISTS (
    SELECT 1 FROM benjaise_sqluser2.PayrollBonusEntries e
    WHERE e.IdUser = b.IdUser AND e.PeriodStart = b.PeriodStart AND e.Category = 'wheelSpins'
  );
GO
