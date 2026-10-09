-- Migration: discretionary bonus per employee per pay period, for the payroll report
-- Run once against production DB before deploying the matching app version.
-- Additive only: creates one new table, touches nothing existing.

IF OBJECT_ID('benjaise_sqluser2.PayrollBonuses') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.PayrollBonuses (
    IdBonus     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayrollBonuses PRIMARY KEY,
    IdUser      INT NOT NULL,
    PeriodStart DATE NOT NULL,
    Amount      DECIMAL(10,2) NOT NULL,
    Note        NVARCHAR(500) NULL,
    ModifiedBy  NVARCHAR(100) NULL,
    ModifiedAt  DATETIME NOT NULL CONSTRAINT DF_PayrollBonuses_ModifiedAt DEFAULT GETDATE(),
    CONSTRAINT FK_PayrollBonuses_User FOREIGN KEY (IdUser) REFERENCES dbo.Users (IdUser)
  );

  -- One bonus row per employee per pay period: re-entering a value for the
  -- same period updates it instead of stacking a second row.
  CREATE UNIQUE INDEX UQ_PayrollBonus_User_Period ON benjaise_sqluser2.PayrollBonuses (IdUser, PeriodStart);
END
