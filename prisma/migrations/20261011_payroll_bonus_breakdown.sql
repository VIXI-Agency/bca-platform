-- Migration: break the single discretionary bonus amount into named categories
-- (Discretionary, Collections, Training, Manager, Wheel Spins, Accounts,
-- Reloads, Verified Leads) matching the categories on the manual timesheet.
--
-- PayrollBonuses (added 20261009) has zero rows in production — the Payment
-- Report shipped two days ago and hasn't been used for a real payroll run
-- yet — so this drops and recreates the table instead of an ALTER.

IF OBJECT_ID('benjaise_sqluser2.PayrollBonuses') IS NOT NULL
  DROP TABLE benjaise_sqluser2.PayrollBonuses;

CREATE TABLE benjaise_sqluser2.PayrollBonuses (
  IdBonus            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayrollBonuses PRIMARY KEY,
  IdUser             INT NOT NULL,
  PeriodStart        DATE NOT NULL,
  DiscretionaryBonus DECIMAL(10,2) NULL,
  CollectionsBonus   DECIMAL(10,2) NULL,
  TrainingBonus      DECIMAL(10,2) NULL,
  ManagerBonus       DECIMAL(10,2) NULL,
  WheelSpins         DECIMAL(10,2) NULL,
  Accounts           DECIMAL(10,2) NULL,
  Reloads            DECIMAL(10,2) NULL,
  VerifiedLeads      DECIMAL(10,2) NULL,
  ModifiedBy         NVARCHAR(100) NULL,
  ModifiedAt         DATETIME NOT NULL CONSTRAINT DF_PayrollBonuses_ModifiedAt DEFAULT GETDATE(),
  CONSTRAINT FK_PayrollBonuses_User FOREIGN KEY (IdUser) REFERENCES dbo.Users (IdUser)
);

CREATE UNIQUE INDEX UQ_PayrollBonus_User_Period ON benjaise_sqluser2.PayrollBonuses (IdUser, PeriodStart);
