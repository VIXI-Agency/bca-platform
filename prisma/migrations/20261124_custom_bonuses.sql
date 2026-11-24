-- Migration: custom bonuses on the Payment Report. Payroll types a name
-- ("Raffle", "Birthday Bonus") and a dollar amount; an employee can have up to
-- 5 per pay period. The name is what prints on the report.
-- Run once against production DB before deploying the matching app version.
-- Additive only: creates one new table. No existing table or row changes.
-- Safe to re-run.

IF OBJECT_ID('benjaise_sqluser2.PayrollCustomBonuses') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.PayrollCustomBonuses (
    IdCustomBonus INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayrollCustomBonuses PRIMARY KEY,
    IdUser        INT NOT NULL,
    PeriodStart   DATE NOT NULL,             -- first day of the employee's pay period
    Name          NVARCHAR(40) NOT NULL,     -- as typed by payroll
    Amount        DECIMAL(10,2) NOT NULL,
    ModifiedBy    NVARCHAR(100) NULL,
    CreatedAt     DATETIME NOT NULL CONSTRAINT DF_PayrollCustomBonuses_CreatedAt DEFAULT GETDATE(),
    CONSTRAINT FK_PayrollCustomBonuses_User FOREIGN KEY (IdUser) REFERENCES dbo.Users (IdUser),
    CONSTRAINT CK_PayrollCustomBonuses_Amount CHECK (Amount > 0),
    CONSTRAINT CK_PayrollCustomBonuses_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0)
  );

  CREATE INDEX IX_PayrollCustomBonuses_User_Period
    ON benjaise_sqluser2.PayrollCustomBonuses (IdUser, PeriodStart);
END
