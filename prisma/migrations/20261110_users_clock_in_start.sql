-- Migration: the time each employee's shift starts, as minutes after midnight
-- Pacific time (300 = 5:00 AM). A clock-in before it is recorded as this time;
-- see src/lib/clock/clock-in-start.ts.
-- NULL = the default, 6:00 AM, which is how every clock-in worked before this
-- column existed.
-- Run once against production DB before deploying the matching app version.
-- Additive only: one nullable column; no existing row changes. Safe to re-run.

IF COL_LENGTH('dbo.Users', 'ClockInStartMinutes') IS NULL
  ALTER TABLE dbo.Users ADD ClockInStartMinutes SMALLINT NULL;
