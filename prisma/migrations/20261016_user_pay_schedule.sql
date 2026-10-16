-- Migration: which pay week each employee is on, over time. Remote employees
-- are paid Friday–Thursday, In House employees Monday–Friday. One row per
-- change: from EffectiveFrom on, the employee is on Schedule. No rows = remote
-- (how every pay period worked before this table existed).
-- A change starts on its week's first day (Monday for In House, Friday for
-- remote) and cuts the previous week short; see src/lib/payroll/pay-schedule.ts.
-- Run once against production DB before deploying the matching app version.
-- Additive only: a new table; no existing row changes.

IF OBJECT_ID('benjaise_sqluser2.UserPaySchedule', 'U') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.UserPaySchedule (
    IdUserPaySchedule INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserPaySchedule PRIMARY KEY,
    IdUser            INT NOT NULL,
    Schedule          NVARCHAR(10) NOT NULL
      CONSTRAINT CK_UserPaySchedule_Schedule CHECK (Schedule IN ('remote', 'inhouse')),
    EffectiveFrom     DATE NOT NULL,
    ChangedBy         NVARCHAR(50) NULL,
    ChangedAt         DATETIME2 NOT NULL CONSTRAINT DF_UserPaySchedule_ChangedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_UserPaySchedule_User_Date UNIQUE (IdUser, EffectiveFrom)
  );
END
