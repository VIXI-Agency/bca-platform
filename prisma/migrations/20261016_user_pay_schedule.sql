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
    CONSTRAINT UQ_UserPaySchedule_User_Date UNIQUE (IdUser, EffectiveFrom),
    -- A change must start on its week's first day, or the days until the next
    -- start day belong to no payroll. 1900-01-01 was a Monday, so the day count
    -- mod 7 is 0 on Mondays and 4 on Fridays, whatever DATEFIRST is set to.
    CONSTRAINT CK_UserPaySchedule_StartDay CHECK (
      (Schedule = 'inhouse' AND DATEDIFF(day, '19000101', EffectiveFrom) % 7 = 0) OR
      (Schedule = 'remote'  AND DATEDIFF(day, '19000101', EffectiveFrom) % 7 = 4)
    )
  );
END
